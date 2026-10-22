# Deployment to the existing Apps Script web app

GitHub stores public source and runs checks. Google Apps Script and the existing spreadsheet remain the runtime and data store. This workflow does not create a new Apps Script project, deployment, spreadsheet, account, or URL.

## Before the first deployment

1. Make a spreadsheet backup and a private backup of the current Apps Script source.
2. Verify the Apps Script project belongs to the School Textbook Allocation System. Obtain its exact `appsscript.json`, compare its runtime, scopes, and web-app settings, and add that reviewed file to the repository. See [the manifest handoff](APPSSCRIPT-MANIFEST.md).
3. Compare the complete current Apps Script file list and content with this repo. `clasp push` replaces the entire online project file set, so every intended project file must be present here before using the workflow. Resolve any differences before proceeding.
4. In the existing Apps Script project, set Script Property `APP_SPREADSHEET_ID` to the ID of its current textbook spreadsheet. Do not place that ID in this repository.
5. Confirm the existing deployment ID and current web-app URL/access settings in Apps Script. The workflow updates only that deployment ID.

## Protect the public repository

1. Protect `main` and require the CI check before merging changes.
2. Create a GitHub Actions environment named `production` and require an owner approval before a deployment job starts. Keep production secrets scoped to this environment; do not add Google credentials to CI or repository-wide secrets.
3. Add environment variables `SCRIPT_ID` and `DEPLOYMENT_ID` using the verified values from the existing textbook Apps Script project.
4. Add environment secret `CLASPRC_JSON` containing the clasp authentication JSON. Generate or obtain this in the owner's Google environment, enter it directly in GitHub settings, and never paste it into chat, an issue, a commit, or a workflow log.

The CI workflow runs on pull requests without deployment secrets. Production deploys are manual, only from `main`, and require the input `DEPLOY`. The workflow checks the verified manifest and required configuration, pushes the checked source, then uses the existing deployment ID with `clasp update-deployment`. That command creates a new immutable Apps Script version and updates the specified existing deployment. It does not create a new deployment.

## Deploy

After the first-deployment checklist and environment protections are complete:

1. Open **Actions → Deploy Apps Script → Run workflow**.
2. Select `main` and type exactly `DEPLOY` in the confirmation field.
3. Review and approve the `production` environment request.
4. Confirm the run succeeded. Then open the existing app URL, test shared data refresh, issue/return, and a small per-book invoice/payment/return-credit scenario. Keep the spreadsheet backup until those checks pass.

The workflow is not configured with credentials in this repository yet. It cannot deploy until the owner adds the reviewed Apps Script manifest, environment variables, protected environment, and environment secret.
