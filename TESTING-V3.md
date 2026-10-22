# V3.0 Test Instructions

## Build-workspace automated checks

The build workspace includes a regression suite using Node.js 18 or later and only built-in modules. From the parent task folder run:

```powershell
node work/tests/run-tests.cjs
```

The checks cover cents-safe invoice balances, legacy invoices with no adjustments, selected lost-book charging, exact-book partial payments, return credits after partial payments, duplicate charge/credit validation, append-only adjustment IDs, shared-state serialization, Records Explorer sorting and pagination, full-filter export, and JavaScript loading checks. The regression suite is kept in the build workspace; it is not uploaded to Apps Script or included in the deployment ZIP.

These checks do not connect to Google Sheets or deploy the app.

## Owner-side staging check

After migration and deployment, use a small set of test learner/book records (or a backup copy of the spreadsheet) before recording real transactions:

1. Assign three books to one learner. Mark two books lost and leave one held.
2. Open the learner record and create an invoice for only one lost book. Confirm the held book remains listed without a charge and the other lost book remains separately selectable.
3. Record a partial payment for the invoiced book code. Confirm the payment history shows that code and the invoice remains open with the remaining balance.
4. Return an invoiced book through the individual return action. Confirm normal return handling marks it returned, a return credit equals the unpaid line balance, the amount due drops, and audit history records both events.
5. Try repeating the invoice or return action. Confirm duplicate charges and duplicate return credits are rejected.
6. Pay another lost book in full. Confirm it is marked paid, excluded from active stock counts, and remains in learner and book history.
7. Search the Records Explorer by learner, book code, invoice, and payment reference. Try grade/class/status/date/type filters, ascending and descending sorting, pagination, and CSV export. Confirm export includes matching rows from every page.
8. Open textbook detail by book code and confirm the timeline includes assignment, lost/return, invoice, payment, credit, and audit entries.
9. Open the same deployed textbook URL in a second browser session. Confirm saved changes appear after refresh and a stale write is blocked with the existing revision-conflict flow.

## Deployment limits

The package author cannot verify the owner's Google identity, spreadsheet permissions, deployment access settings, or live Apps Script execution. The spreadsheet owner must complete those checks and confirm a successful save and reload before staff use the V3 deployment.
