const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

const context = vm.createContext({ console });
vm.runInContext(fs.readFileSync(path.join(__dirname, '../Ledger.gs'), 'utf8'), context, { filename: 'Ledger.gs' });
vm.runInContext(fs.readFileSync(path.join(__dirname, '../Code.gs'), 'utf8'), context, { filename: 'Code.gs' });

const state = () => ({
  allocations: [{ allocationId: 'AL-1', learnerNumber: 'L-1', bookId: 'BK-1', invoiceNo: 'INV-1', status: 'Returned', price: 100 }],
  invoices: [{ invoiceNo: 'INV-1', learnerNumber: 'L-1', total: 100, items: [{ bookId: 'BK-1', amount: 100 }] }],
  payments: [{ paymentNo: 'PAY-1', invoiceNo: 'INV-1', learnerNumber: 'L-1', bookId: 'BK-1', amount: 30 }],
  adjustments: [{ adjustmentId: 'ADJ-1', invoiceNo: 'INV-1', learnerNumber: 'L-1', allocationId: 'AL-1', bookId: 'BK-1', type: 'RETURN_CREDIT', amount: 70 }],
  audit: [{ action: 'BOOK_RETURNED' }],
  seq: { allocation: 2, invoice: 2, payment: 2, adjustment: 2 },
});

context.readSeedTable_ = table => table === 'APP_Learners'
  ? [{ learnerNumber: 'L-1' }]
  : [{ bookId: 'BK-1' }];
context.readAdjustments_ = () => [];
context.appSpreadsheet_ = () => ({ getSheetByName: () => ({}) });
context.readMetaValue_ = () => 2;

test('server accepts a valid legacy-compatible returned-book credit state', () => {
  assert.doesNotThrow(() => context.validateState_(state()));
});

test('server rejects a second return credit for the same invoice book', () => {
  const invalid = state();
  invalid.adjustments.push({ ...invalid.adjustments[0], adjustmentId: 'ADJ-2' });
  assert.throws(() => context.validateState_(invalid));
});

test('server accepts a legacy save without adjustment fields when no credits exist', () => {
  const legacy = state();
  legacy.adjustments = undefined;
  legacy.seq.adjustment = undefined;
  context.readAdjustments_ = () => [];
  assert.doesNotThrow(() => context.validateState_(legacy));
  assert.deepEqual(JSON.parse(JSON.stringify(legacy.adjustments)), []);
  assert.equal(legacy.seq.adjustment, 2);
});

test('server rejects removal of an existing adjustment record', () => {
  const existing = state().adjustments;
  context.readAdjustments_ = () => existing;
  const invalid = state();
  invalid.adjustments = [];
  assert.throws(() => context.validateState_(invalid));
});

test('mutable-state serialization writes one adjustment row with its stable identity', () => {
  const rows = context.rowsForMutableState_(state());
  assert.equal(rows.APP_InvoiceAdjustments.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(rows.APP_InvoiceAdjustments[0])), [
    'ADJ-1', 'INV-1', 'L-1', 'AL-1', 'BK-1', 'RETURN_CREDIT', 70, '', '', JSON.stringify(state().adjustments[0]),
  ]);
});

