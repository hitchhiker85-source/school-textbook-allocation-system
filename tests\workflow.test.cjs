const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

function createWorkflow() {
  const elements = new Map();
  const getElement = id => {
    if (!elements.has(id)) elements.set(id, { id, value: '', addEventListener() {}, parentElement: { parentElement: { querySelector() { return null; } } } });
    return elements.get(id);
  };
  getElement('recordsPageSize').value = '25';
  const document = { createElement: () => ({ dataset: {}, addEventListener() {} }), querySelectorAll: () => [], getElementById: getElement };
  getElement('tabs').insertBefore = () => {};
  getElement('tabs').querySelector = () => ({});
  const context = vm.createContext({ document, console, URL, URLSearchParams, encodeURIComponent, decodeURIComponent, confirm: () => true, alert: message => { context.alertMessage = message; } });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../Ledger.gs'), 'utf8'), context, { filename: 'Ledger.gs' });
  context.$ = getElement;
  context.db = { learners: [{ learnerNumber: 'L-1', firstName: 'Ari', surname: 'Jones', grade: '10', className: '10A' }],
    allocations: [], invoices: [], payments: [], adjustments: [], audit: [], books: [], subjectChoices: [],
    seq: { invoice: 1, payment: 1, allocation: 1, adjustment: 1 } };
  context.textbookCatalogue = [];
  context.learner = no => context.db.learners.find(item => item.learnerNumber === no);
  context.learnerName = () => 'Ari Jones';
  context.book = id => ({ bookId: id, title: 'Title ' + id, replacementPrice: id === 'BK-HELD' ? 25 : 100, grade: '10', subject: 'Maths' });
  context.bookTitle = id => 'Title ' + id;
  context.allocation = (no, id) => context.db.allocations.find(item => item.learnerNumber === no && item.bookId === id);
  context.key = value => String(value || '').toLowerCase();
  context.money = value => 'R' + Number(value || 0).toFixed(2);
  context.esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  context.statusBadge = value => String(value || '');
  context.table = () => '';
  context.availableGrades = () => ['10'];
  context.populateGradeClassFilters = () => {};
  context.csvDownload = () => {};
  context.idgen = (prefix, number) => `${prefix}-${String(number).padStart(5, '0')}`;
  context.now = () => '2026-10-22T08:00:00.000Z';
  context.log = (...args) => context.db.audit.push({ action: args[0], learnerNo: args[1], bookId: args[2], previousState: args[3], newState: args[4], reference: args[5], notes: args[6], timestamp: context.now() });
  context.save = () => { context.saveCount = (context.saveCount || 0) + 1; };
  context.managedLearnerNo = 'L-1';
  context.selectedLearner = null;
  context.selectedInvoice = null;
  context.startApp = () => {};
  const html = fs.readFileSync(path.join(__dirname, '../V3Client.html'), 'utf8');
  vm.runInContext(html.match(/<script>([\s\S]*?)<\/script>/)[1], context, { filename: 'V3Client.html' });
  context.showLearner = () => {};
  context.viewInvoice = () => {};
  context.renderInvoices = () => {};
  context.switchTab = () => {};
  context.closeModal = () => {};
  return { context, getElement };
}

test('invoice creation charges selected lost books and leaves held books uncharged', () => {
  const { context } = createWorkflow();
  context.db.allocations = [
    { allocationId: 'AL-1', learnerNumber: 'L-1', bookId: 'BK-LOST', status: 'Lost', lostAt: '2026-10-20', price: 100 },
    { allocationId: 'AL-2', learnerNumber: 'L-1', bookId: 'BK-HELD', status: 'Outstanding', price: 25 },
  ];
  context.createInvoiceFor('L-1', ['BK-LOST', 'BK-HELD']);
  assert.equal(context.db.invoices.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(context.db.invoices[0].items.map(item => item.bookId))), ['BK-LOST']);
  assert.equal(context.db.allocations[0].status, 'Invoiced');
  assert.equal(context.db.allocations[1].status, 'Outstanding');
  assert.equal(context.invoiceChargeCandidates(context.db.allocations).length, 0);
});

test('returning an invoiced book follows normal handling and credits its remaining balance', () => {
  const { context } = createWorkflow();
  const invoice = { invoiceNo: 'INV-1', learnerNumber: 'L-1', total: 100, items: [{ bookId: 'BK-1', title: 'Title BK-1', amount: 100 }] };
  context.db.invoices = [invoice];
  context.db.allocations = [{ allocationId: 'AL-1', learnerNumber: 'L-1', bookId: 'BK-1', invoiceNo: 'INV-1', status: 'Invoiced', lostAt: '2026-10-20', price: 100 }];
  context.db.payments = [{ paymentNo: 'PAY-1', invoiceNo: 'INV-1', learnerNumber: 'L-1', bookId: 'BK-1', amount: 30 }];
  context.markReturned(encodeURIComponent('L-1'), encodeURIComponent('BK-1'));
  assert.equal(context.db.allocations[0].status, 'Returned');
  assert.equal(context.db.adjustments.length, 1);
  assert.equal(context.db.adjustments[0].amount, 70);
  assert.equal(context.db.payments.length, 1);
  assert.equal(context.invoiceBalance(invoice).due, 0);
  assert.ok(context.db.audit.some(item => item.action === 'INVOICE_RETURN_CREDIT'));
});

test('batch return handling uses the same return-credit transition as individual returns', () => {
  const { context } = createWorkflow();
  const invoice = { invoiceNo: 'INV-1', learnerNumber: 'L-1', total: 100, items: [{ bookId: 'BK-1', title: 'Title BK-1', amount: 100 }] };
  context.db.invoices = [invoice];
  context.db.allocations = [{ allocationId: 'AL-1', learnerNumber: 'L-1', bookId: 'BK-1', invoiceNo: 'INV-1', status: 'Invoiced', lostAt: '2026-10-20', price: 100 }];
  context.db.payments = [{ paymentNo: 'PAY-1', invoiceNo: 'INV-1', learnerNumber: 'L-1', bookId: 'BK-1', amount: 15 }];
  assert.equal(context.recordBookReturn('L-1', 'BK-1', 'Batch return'), true);
  assert.equal(context.db.allocations[0].status, 'Returned');
  assert.equal(context.db.adjustments[0].amount, 85);
  assert.equal(context.invoiceBalance(invoice).due, 0);
});

test('a payment is recorded against the selected book code and partial invoice stays open', () => {
  const { context, getElement } = createWorkflow();
  const invoice = { invoiceNo: 'INV-1', learnerNumber: 'L-1', total: 100, items: [{ bookId: 'BK-1', title: 'Title BK-1', amount: 100 }] };
  context.db.invoices = [invoice];
  context.db.allocations = [{ allocationId: 'AL-1', learnerNumber: 'L-1', bookId: 'BK-1', invoiceNo: 'INV-1', status: 'Invoiced', lostAt: '2026-10-20', price: 100 }];
  context.recordPaymentForBook(encodeURIComponent('INV-1'), encodeURIComponent('BK-1'));
  getElement('v3PayAmount').value = '40';
  getElement('v3PayReference').value = 'RCPT-1';
  getElement('v3SavePayment').onclick();
  assert.equal(context.db.payments.length, 1);
  assert.equal(context.db.payments[0].bookId, 'BK-1');
  assert.equal(context.db.payments[0].amount, 40);
  assert.equal(context.invoiceBalance(invoice).status, 'Open');
  assert.equal(context.invoiceBalance(invoice).due, 60);
});

