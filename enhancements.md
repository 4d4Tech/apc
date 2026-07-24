# APC System Enhancements & Implementation Guide

This document outlines the implementation steps for upgrading the Austin Parking Company (APC) platform with enterprise-grade features, focusing on robust data processing, security, and asynchronous UX. 

## 1. Automated & Manual Batch Processing
**Objective:** Streamline boot receipt logging by introducing AI-driven OCR extraction while maintaining a manual entry fallback for operators.

**Implementation Steps:**
*   **UI/UX Updates (`NewBatch.jsx`):**
    *   Implement a dual-entry interface: a file dropzone for uploading receipt images and a standard form for manual data entry.
    *   Add a toggle or side-by-side layout allowing the operator to explicitly choose between "Auto-Extract from Image" or "Enter Manually".
    *   If auto-extract is selected, display a loading state while the image processes, then auto-fill the form inputs for the operator to review and submit.
*   **Backend Automation (`functions/index.js`):**
    *   Create an HTTP callable Cloud Function or a Storage trigger (`onObjectFinalized`) that integrates with Google Cloud Vision API.
    *   Configure the function to parse uploaded receipt images for key data points (date, boot count, vehicle license plates).
    *   Return the parsed JSON payload back to the Vite frontend to populate the manual entry fields for final operator validation before writing to Firestore.

## 2. Enterprise-Grade Security & Routing
**Objective:** Lock down data access at the network level to ensure strict segregation between Admin and Operator roles.

**Implementation Steps:**
*   **Custom Auth Claims:**
    *   Develop a secure Cloud Function to assign `admin: true` or `operator: true` custom claims to user Auth tokens upon account creation or role assignment.
    *   Update the frontend routing logic to check the token's custom claims rather than querying a Firestore user document, preventing unauthorized access to `AdminDashboard.jsx` and `OperatorManagement.jsx`.
*   **Security Rules (`firestore.rules` & `storage.rules`):**
    *   Refactor `firestore.rules` to utilize `request.auth.token.admin == true`.
    *   Restrict operators to read/write strictly within their own `operator_uid` paths.
    *   Update `storage.rules` to ensure uploaded receipts and generated PDF pay stubs are completely siloed and only accessible by the authenticated creator or an Admin.

## 3. Asynchronous UX & Micro-Interactions
**Objective:** Ensure the React 18 application feels instantaneous and resource-efficient.

**Implementation Steps:**
*   **Skeleton Loaders:**
    *   Design layout-matching skeleton components for `OperatorDashboard.jsx` and `BatchDetails.jsx`.
    *   Render these skeletons while Firestore is actively fetching data, preventing layout shift and eliminating generic spinner wheels.
*   **Optimistic UI Updates:**
    *   Modify state management in `AdminDashboard.jsx` so that when an Admin approves a batch, the UI immediately reflects the "Approved" status.
    *   Execute the Firestore write asynchronously. If the write fails (e.g., network error), revert the UI state to its previous value and display an error toast notification.
*   **Lazy Loading (`pdfGenerator.js`):**
    *   Remove heavy PDF generation libraries (like `jspdf` or `html2canvas`) from the initial Vite bundle load.
    *   Implement dynamic imports (`await import('jspdf')`) inside the function triggered by the "Download Stub" button click, keeping the application's initial load time minimal.

## 4. Financial Lifecycle Hooks
**Objective:** Automate status transitions based on real-world payout events.

**Implementation Steps:**
*   **ACH Webhooks:**
    *   Deploy a dedicated Cloud Function to act as a webhook listener for payment gateway events (e.g., Stripe Connect).
    *   When a successful deposit event is received, map the payment intent ID to the corresponding batch document in Firestore.
    *   Automatically update the batch status from "Processing" to "Paid" and write a notification document to alert the operator in real-time on their dashboard.