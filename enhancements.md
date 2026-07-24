# Enhancement Blueprint: APC Batch-Verification & Enterprise Payroll Capabilities

## 1. Architectural Strategy & Scope
This blueprint outlines the integration of Gusto-level enterprise payroll capabilities while strictly preserving Austin Parking Company's (APC) core daily batch-verification workflow. The operational pipeline (receipt images, vehicle photos, and line-item verification) acts as the foundational trigger for all automated payroll events.

The application leverages a serverless ecosystem using React 18 on the Vite frontend and Google Firebase (Firestore, Cloud Functions, Auth, Storage) for backend execution.

### Third-Party Integrations Required
*   **Payment Gateway (Stripe Connect):** For handling KYC (Know Your Customer) compliance, bank account linking, and executing automated ACH direct deposits.
*   **Tax API (e.g., TaxBandits or Stripe Tax):** For generating, validating, and e-filing end-of-year 1099-NEC forms.

---

## 2. Epic 1: Daily Batch-Verification & Operational Tracking (Core Workflow)
**Objective:** Maintain and optimize the specialized internal workflow where operators submit daily documentation for admin review before any compensation is calculated.

### User Stories & Acceptance Criteria
*   **Story 1.1:** As an Operator, I want to submit my daily batch (vehicle photos, receipt images, transaction counts) securely so that my shift is recorded for review.
    *   *Acceptance Criteria:* `NewBatch.jsx` allows multi-file image uploads. Files are routed securely to Firebase Storage, and the data payload is logged to the Firestore `batches` collection with a default status of `pending`.
*   **Story 1.2:** As an Admin, I want to review pending batches against line items to verify accuracy before approving payouts.
    *   *Acceptance Criteria:* `BatchDetails.jsx` displays a side-by-side view of operator-submitted images and entered transaction data. Admins can change the status to `verified` or `rejected` with accompanying notes.
    *   *Acceptance Criteria:* The payroll calculation engine will strictly ignore any batch that does not carry the `verified` status flag.

### Implementation Details
*   **Storage & Security:** `storage.rules` must ensure that receipt and vehicle images can only be read by authenticated admins and the specific operator who uploaded them.
*   **Data Flow:** The `verified` state change in Firestore acts as the absolute prerequisite gatekeeper for Epic 3 (ACH Direct Deposit).

---

## 3. Epic 2: Operator Self-Service Onboarding & KYC
**Objective:** Operators must be able to securely input their own tax information, upload identification, and link bank accounts without admin intervention.

### User Stories & Acceptance Criteria
*   **Story 2.1:** As an Operator, I want to securely submit my W-9 details during account creation so that I am compliant before submitting my first batch.
    *   *Acceptance Criteria:* The `Signup.jsx` view routes to a secure onboarding flow. PII (Social Security Numbers, EINs) must be encrypted at rest in a new dedicated, strictly-ruled Firestore collection (e.g., `operator_secure_data`).
*   **Story 2.2:** As an Operator, I want to link my bank account so I can receive direct deposits.
    *   *Acceptance Criteria:* Integrate Stripe Elements into the frontend. `OperatorDashboard.jsx` displays the last 4 digits of the linked routing account and a verification status.

### Implementation Details
*   **Security:** Update `firestore.rules` to ensure that `operator_secure_data` can only be read/written by the specific authenticated user (`request.auth.uid == resource.id`) and system admins.

---

## 4. Epic 3: Automated Clearing House (ACH) Direct Deposit
**Objective:** Transition from generating static PDF paystubs to automatically moving funds from the company ledger to the operator's bank account based on verified batches.

### User Stories & Acceptance Criteria
*   **Story 3.1:** As an Admin, I want the "Run Payroll" action to aggregate all `verified` batches for an operator and trigger an ACH transfer.
    *   *Acceptance Criteria:* `AdminDashboard.jsx` includes a payroll confirmation modal summarizing verified batches. Upon approval, selected batch statuses update to `processing`.
*   **Story 3.2:** As the System, I need to communicate with the payment processor to execute the transfer safely.
    *   *Acceptance Criteria:* A Node.js Cloud Function in `functions/index.js` listens for the `processing` status. It calculates the total from the operator's commission structures located in `OperatorRates.jsx` and triggers a Stripe Connect Payout.

### Implementation Details
*   **Dependencies:** Add `stripe` to `functions/package.json`.
*   **Webhook Listener:** Create an HTTP Cloud Function to listen for Stripe webhook events (e.g., `payout.paid`, `payout.failed`) to automatically update the Firestore batch documents to `paid`.

---

## 5. Epic 4: Deductions, Reimbursements & Benefits Engine
**Objective:** Allow custom line-item adjustments to operator paychecks (e.g., uniform deductions, gas reimbursements) prior to payroll execution.

### User Stories & Acceptance Criteria
*   **Story 4.1:** As an Admin, I want to add one-time or recurring deductions/reimbursements to a verified batch before payroll is run.
    *   *Acceptance Criteria:* Admin dashboard supports adding manual line items to a `verified` batch.
*   **Story 4.2:** As an Operator, I want to see my gross pay, deductions, and net pay clearly broken down.
    *   *Acceptance Criteria:* `BatchDetails.jsx` renders a standardized ledger view showing Gross Earnings, Deductions (Taxes, Fees), Reimbursements, and Net Payout. 

### Implementation Details
*   **Data Structure:** Update the Firestore `batches` schema to accept an array of `adjustments`:
    ```json
    {
      "type": "deduction" | "reimbursement",
      "description": "Uniform Fee",
      "amount": 25.00,
      "taxable": false
    }
    ```

---

## 6. Epic 5: Year-End Tax Compliance (1099 Generation)
**Objective:** Automatically track year-to-date (YTD) earnings based on paid batches and generate standardized tax forms.

### User Stories & Acceptance Criteria
*   **Story 5.1:** As an Admin, I want the system to calculate YTD earnings for all operators dynamically.
    *   *Acceptance Criteria:* Each successful payout webhook triggers a Firestore aggregation function that increments a `ytd_earnings` field on the operator's core profile document.
*   **Story 5.2:** As an Operator, I want to download my annual 1099 tax document directly from my dashboard.
    *   *Acceptance Criteria:* `OperatorDashboard.jsx` includes a "Tax Documents" tab. This triggers a Cloud Function that generates a 1099-NEC PDF based on the YTD earnings and the operator's W-9 data.