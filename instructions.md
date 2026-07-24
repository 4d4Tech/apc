Project Blueprint: Austin Parking Payroll & Document Verification System

1. Project Overview

This application is a specialized payroll and document management system built for the Austin Parking Company. It serves two distinct user roles:

Booting Operators: Submit daily batches of vehicle releases, including photographic evidence (vehicle, release forms, and machine receipts).

Owner/Admin: Review submitted documents, approve batches, manage custom per-operator pay rates, and trigger PDF paystub generation.

The goal is to provide a unified platform that replaces manual paper tracking with automated calculation and verification, offering a streamlined experience comparable to systems like Gusto or QuickBooks Payroll.

2. Tech Stack

Frontend Framework: React.js (Functional components, Hooks)

Logic & DOM: Vanilla JavaScript (ES6+)

Styling: Vanilla CSS (Latest standards: Flexbox, Grid, CSS Variables) No Tailwind or external CSS frameworks.

Infrastructure (Backend/Hosting): Google Firebase

Firebase Authentication: Email/Password for Admin and Operators.

Cloud Firestore: NoSQL database for structured data.

Cloud Storage: Secure storage for document images.

Cloud Functions (Node.js): Backend logic for AI extraction, pay calculations, and email/PDF generation.

Firebase Hosting: Serving the React frontend.

PDF Generation: pdfmake or jspdf (via Cloud Functions)

Recommendation: pdfmake is highly recommended for backend Node.js PDF generation due to its declarative definition structure, making it easier to recreate the specific layout of the Austin Parking paystubs and incorporate standard payroll data (Gross, YTD, etc.).

AI Integration: Google Cloud Vision API / Gemini Pro Vision (via Cloud Functions) for extracting text from uploaded receipts and forms.

3. Database Schema (Firestore)

Collection: users

uid (String, Primary Key - matches Firebase Auth)

role (String) - 'admin' | 'operator'

name (String)

email (String)

ratePerBoot (Number) - Admin only field, defines the operator's commission.

Collection: batches

batchId (String, Auto-generated)

operatorId (String, Ref to users.uid)

date (Timestamp)

status (String) - 'pending' | 'approved' | 'paid'

batchTicketUrl (String) - URL to the daily summary receipt image.

batchTotalAmount (Number) - Total dollar amount extracted from the daily summary ticket.

expectedItemCount (Number) - Number of transactions extracted from the ticket.

calculatedPay (Number) - Total Boots in Batch * Operator's ratePerBoot at time of approval.

Sub-Collection: batches/{batchId}/transactions

transactionId (String, Auto-generated)

licensePlate (String)

vehicleDescription (String)

cardLast4 (String)

amountPaid (Number)

photos (Map)

vehicleAngles (Array of Strings/URLs)

receiptUrl (String)

releaseFormUrl (String)

4. Core Features & Workflows

4.1 Operator Workflow: Daily Batch Submission

Dashboard: Operator logs in to a mobile-first dashboard viewing 'Pending Pay', 'Total Boots (Wk)', and 'Recent Batches'.

Initialize Batch: Clicks "New Batch Submission".

Upload Batch Ticket: Operator uploads a photo of the "Daily Batch Ticket" (the terminal summary).

AI Extraction (Batch): The system uses AI to extract the date, Total Amount, Record Count (number of transactions), and line-item details (last 4 of cards) from the batch ticket image.

Add Transactions: Operator adds individual vehicles to match the expected record count.

Operator captures/uploads: Vehicle Pics, Receipt Pic, Release Form Pic.

Operator clicks "Auto-Fill via AI".

AI Extraction (Vehicle): System extracts the License Plate and Vehicle Description from the images.

Operator verifies/edits data, inputs the last 4 digits of the card used, and saves the transaction.

Validation & Submit: System verifies that the number of added vehicles matches the expectedItemCount from the batch ticket (displaying a "MATCHED" indicator). Operator clicks "Submit Full Daily Batch". The batch status becomes pending.

4.2 Admin Workflow: Verification & Payroll

Dashboard: Admin logs in to a desktop-optimized dashboard.

Rate Management: Admin can navigate to an "Operator Rates" tab to easily adjust the ratePerBoot for individual operators.

Batch Review: Admin views a list of daily batches organized by operator.

Document Verification: Admin clicks "View Docs" on a batch. A modal opens showing the Batch Ticket summary alongside the individual vehicle line items (Plate, Description, Card Last 4) and associated images.

Approval Cycle:

Admin clicks "Approve": Status changes to approved. The system locks in the payable amount (Transactions Count * Operator Rate).

Admin can click "Undo" to revert to pending if a mistake was made.

Payroll Execution:

Admin selects approved batches (or groupings for a pay period) and clicks "Pay & Email Stub".

Status changes to paid.

Cloud Function Trigger:

Generates a PDF paystub using pdfmake.

Formats the PDF to include Gross Pay, Number of Boots, Rate, and standard payroll details (simulating Gusto/QuickBooks style tracking for YTD, dates, etc.).

Emails the PDF to the operator's email address on file using a service like SendGrid or Nodemailer.

5. UI/UX Guidelines

Modals: Every modal (Add Vehicle, View Docs, etc.) MUST have a clear 'X' close button.

Operator Interface: Must be highly responsive and touch-friendly (large buttons, clear camera triggers, native date pickers) as it will be used in the field, often at night or in moving vehicles.

Admin Interface: Focus on data density and side-by-side verification (e.g., viewing an image of a receipt next to the digital data representation of that receipt).

Visual Feedback: Use distinct color coding for statuses (Pending = Yellow/Orange, Approved = Blue, Paid = Green). Use loading spinners during AI extraction phases.

6. Security & Rules (Firebase)

Firestore Rules:

Operators can only read/write documents where operatorId matches their auth.uid.

Admins can read/write all documents.

Storage Rules:

Operators can only upload files to /uploads/{uid}/....

Admins can read all files.

Cloud Functions: Ensure all callable functions (like trigger-paystub or process-ai-image) verify the user's Auth token and role before executing.