const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

const code = fs.readFileSync(path.join(__dirname, '../Code.gs'), 'utf8');

function loadCode(overrides = {}) {
  const context = vm.createContext({ console, ...overrides });
  vm.runInContext(code, context, { filename: 'Code.gs' });
  return context;
}

function makeSheet(rows = []) {
  const data = rows.map(row => row.slice());
  return {
    getLastRow() { return data.length; },
    getLastColumn() { return Math.max(0, ...data.map(row => row.length)); },
    getRange(row, column, rowCount = 1, columnCount = 1) {
      return {
        getValues() { return Array.from({ length: rowCount }, (_, r) => Array.from({ length: columnCount }, (_, c) => data[row - 1 + r]?.[column - 1 + c] ?? '')); },
        setValues(values) { values.forEach((valuesRow, r) => { data[row - 1 + r] ||= []; valuesRow.forEach((value, c) => { data[row - 1 + r][column - 1 + c] = value; }); }); },
        setValue(value) { data[row - 1] ||= []; data[row - 1][column - 1] = value; },
      };
    },
    allRows() { return data.map(row => row.slice()); },
  };
}

function makeSpreadsheet(context, masterRows = {}) {
  const sheets = new Map();
  Object.entries(vm.runInContext('APP_SCHEMA', context)).forEach(([name, schema]) => {
    const values = masterRows[name] || [];
    sheets.set(name, makeSheet([schema.headers, ...values]));
  });
  return {
    getSheetByName(name) { return sheets.get(name) || null; },
    insertSheet(name) { const sheet = makeSheet([]); sheets.set(name, sheet); return sheet; },
    sheets,
  };
}

test('spreadsheet access reads the Script Property and opens that configured spreadsheet', () => {
  const calls = [];
  const context = loadCode({
    PropertiesService: { getScriptProperties: () => ({ getProperty: key => key === 'APP_SPREADSHEET_ID' ? 'configured-sheet-id' : null }) },
    SpreadsheetApp: { openById: id => { calls.push(id); return { id }; } },
  });

  assert.deepEqual(JSON.parse(JSON.stringify(context.appSpreadsheet_())), { id: 'configured-sheet-id' });
  assert.deepEqual(calls, ['configured-sheet-id']);
});

test('spreadsheet access fails closed without a Script Property and does not disclose its value', () => {
  const context = loadCode({
    PropertiesService: { getScriptProperties: () => ({ getProperty: () => '' }) },
    SpreadsheetApp: { openById: () => assert.fail('must not open an unconfigured spreadsheet') },
  });

  assert.throws(() => context.appSpreadsheet_(), error => {
    assert.match(error.message, /APP_SPREADSHEET_ID.*Script Properties/i);
    assert.doesNotMatch(error.message, /[A-Za-z0-9_-]{20,}/);
    return true;
  });
});

test('initializer without APP_SEED_DATA preserves existing master rows and reports workbook counts', () => {
  const context = loadCode();
  const originalLearners = [['L-1', 'Sample', 'Learner', '8', '8 A']];
  const spreadsheet = makeSpreadsheet(context, {
    APP_Learners: originalLearners,
    APP_Classes: [['8', '8 A']],
    APP_Catalogue: [['BK-1', '8', 'Maths', 'Mathematics', '', '', '', '', '', 0, 0, 0, 0, ''] ],
    APP_SubjectChoices: [['L-1', 'Sample Learner', '8', '8 A', 'Mathematics', 'sample.xlsx', 'test']],
  });
  context.assertAppOwner_ = () => {};
  context.appSpreadsheet_ = () => spreadsheet;

  const result = context.initializeAppData();

  assert.deepEqual(JSON.parse(JSON.stringify(spreadsheet.sheets.get('APP_Learners').allRows()[1])), originalLearners[0]);
  assert.deepEqual(JSON.parse(JSON.stringify(result.masterDataCounts)), { learners: 1, classes: 1, catalogue: 1, subjectChoices: 1 });
  assert.equal(Object.prototype.hasOwnProperty.call(result, 'seededCounts'), false);
});

test('initializer without APP_SEED_DATA leaves empty master tables empty and reports zero counts', () => {
  const context = loadCode();
  const spreadsheet = makeSpreadsheet(context);
  context.assertAppOwner_ = () => {};
  context.appSpreadsheet_ = () => spreadsheet;

  const result = context.initializeAppData();

  assert.deepEqual(JSON.parse(JSON.stringify(result.masterDataCounts)), { learners: 0, classes: 0, catalogue: 0, subjectChoices: 0 });
  assert.equal(result.requiresOwnerImport, true);
  for (const name of ['APP_Learners', 'APP_Classes', 'APP_Catalogue', 'APP_SubjectChoices']) assert.equal(spreadsheet.sheets.get(name).getLastRow(), 1);
});

test('optional class and subject-choice rows do not block a populated learner and catalogue setup', () => {
  const context = loadCode();
  const spreadsheet = makeSpreadsheet(context, {
    APP_Learners: [['L-1', 'Sample', 'Learner', '8', '8 A']],
    APP_Catalogue: [['BK-1', '8', 'Maths', 'Mathematics', '', '', '', '', '', 0, 0, 0, 0, '']],
  });
  context.assertAppOwner_ = () => {};
  context.appSpreadsheet_ = () => spreadsheet;

  assert.equal(context.initializeAppData().requiresOwnerImport, false);
});

test('source has no spreadsheet ID literal or diagnostic suffix exposure', () => {
  assert.doesNotMatch(code, /const\s+APP_SPREADSHEET_ID\s*=\s*['"][^'"]+['"]/);
  assert.doesNotMatch(code, /targetSpreadsheetSuffix/);
  const html = fs.readFileSync(path.join(__dirname, '../Index.html'), 'utf8');
  assert.doesNotMatch(html, /targetSpreadsheetSuffix|spreadsheet \u2026/);
});

test('fresh-install guidance does not promise bundled learner or catalogue data', () => {
  const html = fs.readFileSync(path.join(__dirname, '../Index.html'), 'utf8');
  assert.doesNotMatch(html, /seeded learner register|built-in catalogue/i);
  assert.match(html, /owner[\s\S]{0,100}import[\s\S]{0,100}learner/i);
});

