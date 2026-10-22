# Security and data handling

This public repository contains application source and generic documentation only. It must never contain learner names or numbers, spreadsheet exports, payment or audit records, a spreadsheet ID, OAuth credentials, local clasp configuration, or production backups.

The production spreadsheet ID belongs in the existing Apps Script project's Script Properties as `APP_SPREADSHEET_ID`. Local `.clasp.json`, `.clasprc.json`, and GitHub Actions secrets are private configuration and must not be committed or printed in logs.

Pull-request checks run without production credentials. Production deployment is manual and must use the protected `production` environment, with approval required before secrets are available. Report suspected exposure to the repository owner and rotate any credential that may have been disclosed.
