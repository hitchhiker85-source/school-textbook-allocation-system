const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

const sourceDirectory = fs.existsSync(path.join(__dirname, '../Code.gs')) ? '..' : '../v3-source';
const source = name => fs.readFileSync(path.join(__dirname, sourceDirectory, name), 'utf8');

test('Apps Script server and ledger sources parse as JavaScript', () => {
  assert.doesNotThrow(() => new vm.Script(source('Code.gs'), { filename: 'Code.gs' }));
  assert.doesNotThrow(() => new vm.Script(source('Ledger.gs'), { filename: 'Ledger.gs' }));
});

test('main browser script and V3 client script parse as JavaScript', () => {
  const scripts = [...source('Index.html').matchAll(/<script>([\s\S]*?)<\/script>/g)].map(match => match[1]);
  assert.ok(scripts.length >= 2);
  assert.doesNotThrow(() => new vm.Script(scripts[1], { filename: 'Index.html' }));
  const v3 = source('V3Client.html').match(/<script>([\s\S]*?)<\/script>/);
  assert.ok(v3);
  assert.doesNotThrow(() => new vm.Script(v3[1], { filename: 'V3Client.html' }));
});

