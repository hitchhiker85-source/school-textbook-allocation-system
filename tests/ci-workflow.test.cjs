const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('CI runs the regression suite on pushes and pull requests with read-only permissions', () => {
  const candidates = [path.join(__dirname, '../github-repo/.github/workflows/ci.yml'), path.join(__dirname, '../.github/workflows/ci.yml')];
  const file = candidates.find(candidate => fs.existsSync(candidate));
  assert.ok(file, 'CI workflow file must exist');
  const workflow = fs.readFileSync(file, 'utf8');
  assert.match(workflow, /^name:\s*CI/m);
  assert.match(workflow, /pull_request:/);
  assert.match(workflow, /push:[\s\S]*branches:\s*\[?main\]?/);
  assert.match(workflow, /permissions:\s*\n\s+contents:\s*read/);
  assert.match(workflow, /node tests\/run-tests\.cjs/);
  assert.doesNotMatch(workflow, /secrets\.|environment:\s*production|clasp\s+(?:push|deploy|update-deployment)/i);
});

