const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

const context = vm.createContext({});
const ledgerPath = path.join(__dirname, '../Ledger.gs');
vm.runInContext(fs.readFileSync(ledgerPath, 'utf8'), context, { filename: 'Ledger.gs' });
const invoices = [{ invoiceNo: 'INV-1', learnerNumber: 'L-1', items: [{ bookId: 'BK-1', amount: 100 }] }];
const allocations = [{ allocationId: 'AL-1', learnerNumber: 'L-1', bookId: 'BK-1', invoiceNo: 'INV-1', status: 'Returned' }];
const payments = [{ paymentNo: 'PAY-1', invoiceNo: 'INV-1', learnerNumber: 'L-1', bookId: 'BK-1', amount: 30 }];
const validCredit = { adjustmentId: 'ADJ-1', invoiceNo: 'INV-1', learnerNumber: 'L-1', allocationId: 'AL-1', bookId: 'BK-1', type: 'RETURN_CREDIT', amount: 70 };
const mustReject = (run, pattern) => assert.throws(run, error => pattern.test(String(error && error.message)));

test('legacy invoices validate with no adjustment rows', () => {
  assert.equal(context.validateAdjustmentRecords(invoices, allocations, [], [], []), true);
});

test('valid return credit matches invoice, learner, allocation, and book', () => {
  assert.equal(context.validateAdjustmentRecords(invoices, allocations, payments, [validCredit], []), true);
});

test('adjustment IDs stay unique within the saved state', () => {
  mustReject(() => context.validateAdjustmentRecords(invoices, allocations, payments, [validCredit, { ...validCredit }], []), /unique/i);
});

test('one invoice book cannot be credited twice', () => {
  const second = { ...validCredit, adjustmentId: 'ADJ-2' };
  mustReject(() => context.validateAdjustmentRecords(invoices, allocations, payments, [validCredit, second], []), /more than once/i);
});

test('a credit cannot exceed the unpaid book balance', () => {
  const tooLarge = { ...validCredit, amount: 71 };
  mustReject(() => context.validateAdjustmentRecords(invoices, allocations, payments, [tooLarge], []), /exceed|balance|amount/i);
});

test('all existing adjustment IDs must remain in the next saved state', () => {
  mustReject(() => context.validateAdjustmentRecords(invoices, allocations, payments, [], [validCredit]), /append|existing|remove/i);
});

test('existing adjustment references and timestamps cannot be edited', () => {
  const previous = { ...validCredit, createdAt: '2026-10-20T10:00:00Z', reference: 'RETURN-ADJ-1' };
  const changed = { ...previous, reference: 'edited' };
  mustReject(() => context.validateAdjustmentRecords(invoices, allocations, payments, [changed], [previous]), /append-only|edited/i);
});

