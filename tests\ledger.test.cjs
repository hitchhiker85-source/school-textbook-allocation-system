const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

const context = vm.createContext({});
const ledgerPath = path.join(__dirname, '../Ledger.gs');
const ledgerSource = fs.existsSync(ledgerPath) ? fs.readFileSync(ledgerPath, 'utf8') : '';
vm.runInContext(ledgerSource, context, { filename: 'Ledger.gs' });

const invoice = { invoiceNo: 'INV-1', items: [{ bookId: 'BK-1', amount: 100 }] };

test('legacy invoice line loads with zero credits and its original amount due', () => {
  const result = context.lineLedger(invoice, 'BK-1', [], []);
  assert.deepEqual(JSON.parse(JSON.stringify(result)), {
    charged: 100, paid: 0, credited: 0, due: 100, state: 'Open',
  });
});

test('a partial payment stays attached to its exact book line', () => {
  const result = context.lineLedger(invoice, 'BK-1', [
    { invoiceNo: 'INV-1', bookId: 'BK-1', amount: 35 },
    { invoiceNo: 'INV-1', bookId: 'BK-2', amount: 20 },
  ], []);
  assert.equal(result.paid, 35);
  assert.equal(result.due, 65);
  assert.equal(result.state, 'Part-paid');
});

test('full payment settles the individual book line', () => {
  const result = context.lineLedger(invoice, 'BK-1', [
    { invoiceNo: 'INV-1', bookId: 'BK-1', amount: 100 },
  ], []);
  assert.equal(result.due, 0);
  assert.equal(result.state, 'Paid');
});

test('return credit after partial payment credits only the unpaid amount', () => {
  const payments = [{ invoiceNo: 'INV-1', bookId: 'BK-1', amount: 30 }];
  const credit = context.returnCredit(invoice, 'BK-1', payments, []);
  assert.equal(credit.amount, 70);
  assert.equal(credit.type, 'RETURN_CREDIT');
  const result = context.lineLedger(invoice, 'BK-1', payments, [credit]);
  assert.equal(result.due, 0);
  assert.equal(result.paid, 30);
  assert.equal(result.credited, 70);
  assert.equal(result.state, 'Credited');
});

test('a second return credit for one invoice book is rejected', () => {
  const credit = { invoiceNo: 'INV-1', bookId: 'BK-1', type: 'RETURN_CREDIT', amount: 100 };
  assert.throws(() => context.returnCredit(invoice, 'BK-1', [], [credit]));
});

test('credit arithmetic never makes the amount due negative', () => {
  const result = context.lineLedger(invoice, 'BK-1', [
    { invoiceNo: 'INV-1', bookId: 'BK-1', amount: 100 },
  ], [{ invoiceNo: 'INV-1', bookId: 'BK-1', type: 'RETURN_CREDIT', amount: 100 }]);
  assert.equal(result.due, 0);
});

test('an invoice stays open while any book line remains due', () => {
  const twoBooks = { invoiceNo: 'INV-1', items: [
    { bookId: 'BK-1', amount: 100 }, { bookId: 'BK-2', amount: 60 },
  ] };
  const result = context.invoiceLedger(twoBooks, [
    { invoiceNo: 'INV-1', bookId: 'BK-1', amount: 100 },
  ], []);
  assert.equal(result.status, 'Open');
  assert.equal(result.due, 60);
});

test('only confirmed lost books without an existing invoice are charge candidates', () => {
  const allocations = [
    { bookId: 'BK-1', status: 'Outstanding' },
    { bookId: 'BK-2', status: 'Lost' },
    { bookId: 'BK-3', status: 'Lost', invoiceNo: 'INV-OLD' },
    { bookId: 'BK-4', status: 'Returned' },
    { bookId: 'BK-5', status: 'Paid' },
  ];
  assert.deepEqual(JSON.parse(JSON.stringify(context.invoiceChargeCandidates(allocations).map(item => item.bookId))), ['BK-2']);
});

test('learner books are grouped into held, lost, returned, and paid history', () => {
  const allocations = [
    { bookId: 'BK-1', status: 'Outstanding' },
    { bookId: 'BK-2', status: 'Issued' },
    { bookId: 'BK-3', status: 'Invoiced', lostAt: '2026-01-01' },
    { bookId: 'BK-4', status: 'Lost' },
    { bookId: 'BK-5', status: 'Returned' },
    { bookId: 'BK-6', status: 'Paid', lostAt: '2026-01-02' },
  ];
  const sections = Object.fromEntries(Object.entries(context.learnerBookSections(allocations)).map(([key, items]) => [key, items.map(item => item.bookId)]));
  assert.deepEqual(JSON.parse(JSON.stringify(sections)), {
    held: ['BK-1', 'BK-2'], lost: ['BK-3', 'BK-4'], returned: ['BK-5'], paidLost: ['BK-6'],
  });
});

