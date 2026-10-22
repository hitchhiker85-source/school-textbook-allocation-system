# School Textbook Allocation System

Sanitized Apps Script source for the V3 school textbook allocation system. Google Apps Script remains the application runtime and Google Sheets remains the system of record. This public repository contains source and generic setup instructions only; it does not contain learner records or access to the live spreadsheet.

## What is included

- Shared issue and return workflows, book-code scanning support in the textbook app, per-book invoicing and payments, Records Explorer, and audit history.
- Privacy checks and regression tests.
- A manual, protected workflow for updating an existing Apps Script deployment after owner setup.

## Setup

Start with [README-Install.md](README-Install.md), then review [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) and [docs/APPSSCRIPT-MANIFEST.md](docs/APPSSCRIPT-MANIFEST.md). The exact manifest must come from the verified Apps Script project. Do not deploy until the existing project and its source files have been backed up and compared.

Run local checks with `npm test` using Node.js 22 or later. The public repository is not hosted through GitHub Pages. Do not add school data, export files, credentials, or local clasp configuration here.
