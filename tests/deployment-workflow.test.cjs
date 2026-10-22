const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('production deployment is manual, main-only, explicit, and uses the existing deployment ID', () => {
  const candidates = [path.join(__dirname, '../github-repo/.github/workflows/deploy-apps-script.yml'), path.join(__dirname, '../.github/workflows/deploy-apps-script.yml')];
  const file = candidates.find(candidate => fs.existsSync(candidate));
  assert.ok(file, 'deployment workflow file must exist');
  const workflow = fs.readFileSync(file, 'utf8');
  assert.match(workflow, /^name:\s*Deploy Apps Script/m);
  assert.match(workflow, /workflow_dispatch:/);
  assert.doesNotMatch(workflow, /pull_request:|push:/);
  assert.match(workflow, /refs\/heads\/main/);
  assert.match(workflow, /DEPLOY/);
  assert.match(workflow, /environment:\s*production/);
  assert.match(workflow, /CLASPRC_JSON/);
  assert.match(workflow, /SCRIPT_ID/);
  assert.match(workflow, /DEPLOYMENT_ID/);
  assert.match(workflow, /appsscript\.json/);
  assert.match(workflow, /clasp@3\.4\.1 update-deployment/);
  assert.doesNotMatch(workflow, /clasp create-deployment|clasp deploy\s*$/i);
  assert.doesNotMatch(workflow, /echo\s+.*CLASPRC_JSON|cat\s+.*clasprc/i);
});

