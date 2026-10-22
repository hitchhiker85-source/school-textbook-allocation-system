const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const files = [];
function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && ['.git', 'node_modules'].includes(entry.name)) continue;
    const absolute = path.join(directory, entry.name);
    const relative = path.relative(root, absolute).replaceAll(path.sep, '/');
    if (entry.isDirectory()) walk(absolute);
    else files.push({ absolute, relative });
  }
}
walk(root);

test('repository tree contains no private data, credentials, exports, or separate scanner app', () => {
  const allowedRootFiles = new Set([
    '.claspignore', '.gitignore', 'Code.gs', 'Index.html', 'Ledger.gs', 'MIGRATION-V3.md',
    'README-Install.md', 'README.md', 'SECURITY.md', 'TESTING-V3.md', 'V3Client.html',
    'appsscript.json', 'package.json', 'package-lock.json',
  ]);
  for (const file of files) {
    const allowed = allowedRootFiles.has(file.relative)
      || ['docs/APPSSCRIPT-MANIFEST.md', 'docs/DEPLOYMENT.md', '.github/workflows/ci.yml', '.github/workflows/deploy-apps-script.yml'].includes(file.relative)
      || /^tests\/(?:[a-z0-9-]+\.test\.cjs|run-tests\.cjs)$/i.test(file.relative);
    assert.ok(allowed, `path is outside the reviewed repository allowlist: ${file.relative}`);
  }

  const forbiddenName = /(^|\/)(SeedData\.gs|\.clasprc\.json|\.clasp\.json|\.env(?:\..*)?|[^/]*learner[^/]*\.(?:csv|tsv|xlsx?|json)|[^/]*student[^/]*\.(?:csv|tsv|xlsx?|json)|[^/]*scanner[^/]*|[^/]*qr[^/]*scanner[^/]*)$/i;
  for (const file of files) assert.doesNotMatch(file.relative, forbiddenName, `forbidden repository path: ${file.relative}`);

  const forbiddenExtension = /\.(?:csv|tsv|xlsx?|ods|sqlite|db|bak|backup)$/i;
  for (const file of files) assert.doesNotMatch(file.relative, forbiddenExtension, `data or backup file is not allowed: ${file.relative}`);
});

test('repository text contains no spreadsheet ID literal or production seed payload', () => {
  const textFiles = files.filter(file => /\.(?:gs|html|md|json|cjs|yml|yaml)$/i.test(file.relative));
  for (const file of textFiles) {
    const content = fs.readFileSync(file.absolute, 'utf8');
    assert.doesNotMatch(content, /['"`]1[A-Za-z0-9_-]{30,60}['"`]/, `quoted spreadsheet-ID-like value found in ${file.relative}`);
    assert.doesNotMatch(content, /ya29\.[A-Za-z0-9_-]+|1\/\/0\.[A-Za-z0-9_-]+/, `Google OAuth token-like value found in ${file.relative}`);
    assert.doesNotMatch(content, /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i, `email address found in ${file.relative}`);
  }
  const code = fs.readFileSync(path.join(root, 'Code.gs'), 'utf8');
  assert.doesNotMatch(code, /APP_SEED_DATA|spreadsheetId\s*=\s*['"]/);
  assert.doesNotMatch(code, /targetSpreadsheetSuffix/);
});

test('Apps Script manifest is intentionally a reviewed owner handoff, never a fabricated placeholder', () => {
  const manifest = path.join(root, 'appsscript.json');
  if (!fs.existsSync(manifest)) {
    assert.match(fs.readFileSync(path.join(root, 'docs/APPSSCRIPT-MANIFEST.md'), 'utf8'), /owner must retrieve/i);
  } else {
    const value = JSON.parse(fs.readFileSync(manifest, 'utf8'));
    assert.ok(value.timeZone && value.runtimeVersion, 'manifest must contain the owner-verified Apps Script runtime settings');
  }
});




