# V3.0 Spreadsheet Migration

The repository-safe V3.0.1 source contains no embedded learner seed or spreadsheet ID. Configure the existing spreadsheet ID in Apps Script **Project Settings → Script Properties** as `APP_SPREADSHEET_ID` before running any app function. If the property is missing, spreadsheet access fails closed.

## What changes

V3 adds one application tab, `APP_InvoiceAdjustments`, for stable, append-only per-book return-credit records. It adds the `nextAdjustmentId` counter and advances `APP_Meta.schemaVersion` from 1 to 2. Existing allocation, invoice, invoice-item, payment, audit, learner, catalogue, subject-choice, class, and unrelated spreadsheet tabs are kept.

## Safe update order

1. Make a backup copy of the textbook spreadsheet.
2. Replace/add the Apps Script source files using `README-Install.md`.
3. Run `initializeAppData()` as the spreadsheet owner.
4. Confirm the new tab headers and that existing invoices and payments are still present.
5. Deploy a new version of the existing web-app deployment.
6. Open the existing URL and confirm it loads the shared snapshot.

The initializer checks all existing `APP_*` headers before writing. It creates missing tabs with the expected header rows and returns the existing master-data counts. It does not seed or overwrite learner, class, catalogue, or subject-choice rows; it does not clear existing transactions or change non-`APP_` tabs. A schema version newer than 2 or an unsupported older version stops initialization for manual review. An empty install remains empty until the owner deliberately imports approved master data.

## Legacy invoice behavior

Legacy invoice items have no return-credit entries, so their credit total is zero. Existing payment records remain linked to their invoice and book code. The V3 snapshot includes `adjustments: []` when the new tab is empty. Old saves that omit this field are normalized to the current persisted adjustment rows; an old client cannot remove or rewrite an existing adjustment record.

## Recovery

If initialization stops because a tab header or schema version is incompatible, do not rename, clear, or recreate the tab automatically. Compare its headers with this package and restore from the spreadsheet backup if needed. If deployment fails, restore the previous Apps Script source from your backup and redeploy the earlier version.
