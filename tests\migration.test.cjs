const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

function makeSheet(name, rows) {
  const data = rows.map(row => row.slice());
  return {
    name,
    getLastRow() { return data.length; },
    getLastColumn() { return Math.max(0, ...data.map(row => row.length)); },
    getRange(row, column, rowCount = 1, columnCount = 1) {
      return {
        getValues() {
          return Array.from({ length: rowCount }, (_, r) => Array.from({ length: columnCount }, (_, c) => data[row - 1 + r]?.[column - 1 + c] ?? ''));
        },
        setValues(values) {
          values.forEach((valuesRow, r) => {
            const targetRow = row - 1 + r;
            data[targetRow] ||= [];
            valuesRow.forEach((value, c) => { data[targetRow][column - 1 + c] = value; });
          });
        },
        setValue(value) {
          data[row - 1] ||= [];
          data[row - 1][column - 1] = value;
        },
      };
    },
    allRows() { return data.map(row => row.slice()); },
  };
}

test('initializer adds V3 adjustment tab and preserves legacy invoices and unrelated tabs', () => {
  const sheets = new Map([
    ['APP_Meta', makeSheet('APP_Meta', [['key', 'value'], ['schemaVersion', 1], ['revision', 7], ['initializationComplete', true], ['nextInvoiceId', 2]])],
    ['APP_Invoices', makeSheet('APP_Invoices', [['invoiceNo', 'learnerNumber', 'createdAt', 'total', 'notes', 'itemCount', 'recordJson'], ['INV-OLD', 'L-1', '2026-01-01', 50, '', 1, '{}']])],
    ['Finance', makeSheet('Finance', [['Keep'], ['Do not change']])],
  ]);
  const spreadsheet = {
    getSheetByName(name) { return sheets.get(name) || null; },
    insertSheet(name) { const sheet = makeSheet(name, []); sheets.set(name, sheet); return sheet; },
  };
  const context = vm.createContext({});
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../Ledger.gs'), 'utf8'), context, { filename: 'Ledger.gs' });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../Code.gs'), 'utf8'), context, { filename: 'Code.gs' });
  context.assertAppOwner_ = () => {};
  context.appSpreadsheet_ = () => spreadsheet;
  const result = context.initializeAppData();

  assert.ok(result.createdTabs.includes('APP_InvoiceAdjustments'));
  assert.deepEqual(sheets.get('APP_InvoiceAdjustments').allRows()[0], ['adjustmentId', 'invoiceNo', 'learnerNumber', 'allocationId', 'bookId', 'type', 'amount', 'createdAt', 'reference', 'recordJson']);
  assert.equal(sheets.get('APP_Meta').allRows().find(row => row[0] === 'schemaVersion')[1], 2);
  assert.equal(sheets.get('APP_Meta').allRows().find(row => row[0] === 'revision')[1], 7);
  assert.deepEqual(sheets.get('APP_Invoices').allRows()[1], ['INV-OLD', 'L-1', '2026-01-01', 50, '', 1, '{}']);
  assert.deepEqual(sheets.get('Finance').allRows(), [['Keep'], ['Do not change']]);
});

