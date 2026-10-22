# School Textbook Allocation System V3.0.1 — Install and Update

This package updates the shared School Textbook Allocation System Apps Script app. It keeps the existing textbook spreadsheet and deployment, adds auditable return credits, and introduces the Records Explorer and per-book billing flow.

## Package files

- `Code.gs` — shared spreadsheet API, schema migration, validation, revision locking, audit, and web-app entry point.
- `Ledger.gs` — per-book charge, payment, credit, and invoice balance rules.
- `Index.html` — main application interface and shared-data loader.
- `V3Client.html` — V3 invoice, learner detail, Records Explorer, and textbook-history interface.
- `MIGRATION-V3.md` — additive spreadsheet migration notes.
- `TESTING-V3.md` — local test commands and owner-side verification checklist.

## Before updating

1. Make a backup copy of the textbook spreadsheet.
2. Confirm this is the spreadsheet already used by the textbook app. The `APP_*` tabs are namespaced to this application; other tabs are preserved.
3. If any existing `APP_*` tab has unexpected headers, stop and review it manually. The initializer rejects incompatible headers rather than clearing or replacing them.

## Apps Script files

Open the existing bound Apps Script project for the textbook spreadsheet. Keep that project and its deployment. Replace `Code.gs` and `Index.html` with the matching package files. Add `Ledger.gs` using **+ → Script** and add `V3Client.html` using **+ → HTML** (the file’s Apps Script HTML name is `V3Client`). Save all files. Do not add a learner seed file; learner, class, catalogue, and subject-choice rows remain in the existing spreadsheet.

In the Apps Script project settings, add the script property `APP_SPREADSHEET_ID` with the ID of the existing textbook spreadsheet. This sanitized source package deliberately contains no spreadsheet ID. If the property is missing, the app stops before opening a spreadsheet and the diagnostic does not reveal any part of the ID.

`Index.html` includes `V3Client.html` using the `include()` helper in `Code.gs`. Do not paste either HTML file into `Code.gs`.

## Initialize the additive migration

1. In the Apps Script editor, select `initializeAppData()` and run it while signed in as the spreadsheet owner.
2. Review and allow the spreadsheet authorization prompt if requested.
3. The initializer creates only missing `APP_*` tabs and validates existing headers. For a V22 schema it adds `APP_InvoiceAdjustments`, adds its counter to `APP_Meta`, and advances schema version 1 to 2. It does not seed, overwrite, or clear existing learner, catalogue, transaction, or non-application rows.
4. Confirm `APP_InvoiceAdjustments` has these headers: `adjustmentId`, `invoiceNo`, `learnerNumber`, `allocationId`, `bookId`, `type`, `amount`, `createdAt`, `reference`, and `recordJson`.
5. Run `authorizeSharedSpreadsheetAccess()` if the Apps Script editor requests a permission check. It is read-only.

Existing invoices, invoice lines, and payments remain as they are. Existing invoice lines start with zero return credits. New return credits are separate records and the audit log records the return and credit. Do not manually edit or delete adjustment rows.

For a new empty spreadsheet, initialization creates empty application tabs and reports the current row counts. The app owner must import approved learner and catalogue records through the owner's normal controlled import process before staff use it. Initialization never publishes or supplies learner data.

## Deploy the update

1. Choose **Deploy → Manage deployments** in the existing Apps Script project.
2. Edit the current web-app deployment, choose a new version, and deploy.
3. Keep the existing execute-as and access settings. The update uses the same textbook spreadsheet and should keep the current web-app URL.
4. Staff should refresh the existing textbook web-app page after deployment.

The existing access model remains in force. Anyone who has a link configured for anonymous access may view and change records through that link. Share it only with staff who should have access.

## V3 workflow

- A learner invoice statement separates **Reported lost** books from **Still with learner** books. Held books remain visible and are not charged until a staff member reports them lost.
- Staff can select individual lost books to invoice. Each charge is linked to one learner allocation and book code; duplicate charges are rejected.
- Payment entry applies to one selected invoice book code. Partial payments are allowed, and the invoice stays open while any book line has an amount due.
- Returning a charged book uses the normal return action and creates a credit for the remaining unpaid amount. Existing payment records stay in history.
- A fully paid lost book remains in history and is excluded from active stock counts.
- The Records Explorer searches across learners, textbooks, allocations, invoices, invoice lines, payments, return credits, and audit events. Filters apply to the full result set; CSV export includes all matching rows across every page.
- Textbook history is opened by book code and shows assignments, loss/return events, invoice charges, credits, payments, and audit events.

## Owner verification

Follow `TESTING-V3.md` after deploying. Verify the migration and a small set of test records before using real transactions. Confirm that a returned invoiced book’s amount due drops by its credit and that a paid/lost item remains visible in history.

The package can be checked locally, but the spreadsheet owner must verify Google authorization, deployment settings, shared-session behavior, and live saving in Apps Script. This package has not been deployed from this session.
