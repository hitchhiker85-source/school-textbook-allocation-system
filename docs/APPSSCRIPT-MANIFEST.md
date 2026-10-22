# Apps Script manifest handoff

The V3.0.1 source archive does not contain `appsscript.json` because the exact manifest for the currently deployed Apps Script project was not available in the workspace. Do not invent or reconstruct it from assumptions.

Before the first `clasp push`, the owner must retrieve `appsscript.json` from the verified textbook Apps Script project and check that its runtime, scopes, web-app access, and execution settings match the current deployment. Commit that reviewed manifest as `appsscript.json`. The deployment workflow checks for the file and stops when it is missing.
