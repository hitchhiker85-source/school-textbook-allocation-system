const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

function createExplorer() {
  const elements = new Map();
  const getElement = id => {
    if (!elements.has(id)) elements.set(id, { id, value: id === 'recordsPageSize' ? '25' : '', events: {}, addEventListener(type, handler) { this.events[type] = handler; }, scrollIntoView() {}, parentElement: { parentElement: { querySelector() { return null; } } } });
    return elements.get(id);
  };
  const nav = { insertBefore() {}, querySelector() { return {}; } };
  getElement('tabs').insertBefore = () => {};
  getElement('tabs').querySelector = () => ({});
  getElement('bulkInvoice').parentElement.parentElement.querySelector = () => null;
  const document = { createElement: () => ({ dataset: {}, addEventListener() {} }), querySelectorAll: () => [], getElementById: getElement };
  const context = vm.createContext({ document, console, URL, URLSearchParams, encodeURIComponent, decodeURIComponent });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../Ledger.gs'), 'utf8'), context, { filename: 'Ledger.gs' });
  context.$ = getElement;
  context.db = {
    learners: [{ learnerNumber: 'L-1', firstName: 'Ari', surname: 'Jones', grade: '10', className: '10A' }],
    allocations: [], invoices: [], payments: Array.from({ length: 30 }, (_, index) => ({ paymentNo: `PAY-${index}`, invoiceNo: `INV-${index}`, learnerNumber: 'L-1', bookId: `BK-${String(index).padStart(2, '0')}`, amount: index + 1, method: 'Cash', createdAt: `2026-05-${String(index + 1).padStart(2, '0')}` })),
    adjustments: [], audit: [], subjectChoices: [], books: [], seq: { invoice: 1, payment: 31, allocation: 1, adjustment: 1 },
  };
  context.textbookCatalogue = [];
  context.learnerName = no => no === 'L-1' ? 'Ari Jones' : no;
  context.learner = no => context.db.learners.find(item => item.learnerNumber === no);
  context.book = id => context.textbookCatalogue.find(item => item.BookID === id) || { bookId: id, title: id, replacementPrice: 0 };
  context.bookTitle = id => id;
  context.key = value => String(value || '').toLowerCase();
  context.money = value => String(value);
  context.esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  context.availableGrades = () => ['10'];
  context.populateGradeClassFilters = () => {};
  context.table = (headers, rows) => `${rows.length} rows\n${rows.join('\n')}`;
  context.statusBadge = value => String(value);
  context.csvDownload = (name, rows) => { context.lastCsv = { name, rows }; };
  context.startApp = () => {};
  const html = fs.readFileSync(path.join(__dirname, '../V3Client.html'), 'utf8');
  const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  vm.runInContext(script, context, { filename: 'V3Client.html' });
  return { context, getElement };
}

test('Records Explorer supports both ascending and descending sort order', () => {
  const { context, getElement } = createExplorer();
  getElement('recordsType').value = 'Payment';
  getElement('recordsSort').value = 'amount';
  getElement('recordsDirection').value = 'desc';
  assert.equal(context.filteredRecordRows()[0].amount, 30);
  getElement('recordsDirection').value = 'asc';
  assert.equal(context.filteredRecordRows()[0].amount, 1);
});

test('Records Explorer pagination does not limit filtered CSV export', () => {
  const { context, getElement } = createExplorer();
  getElement('recordsType').value = 'Payment';
  getElement('recordsSort').value = 'amount';
  context.renderRecordsExplorer();
  assert.match(getElement('recordsTable').innerHTML, /^25 rows/);
  getElement('recordsNext').events.click();
  assert.equal(getElement('recordsPageLabel').textContent, 'Page 2 of 2');
  assert.match(getElement('recordsTable').innerHTML, /^5 rows/);
  getElement('recordsExport').events.click();
  assert.equal(context.lastCsv.rows.length, 30);
});

test('Records Explorer applies text, grade, class, status, and date filters together', () => {
  const { context, getElement } = createExplorer();
  getElement('recordsSearch').value = 'BK-0';
  getElement('recordsType').value = 'Payment';
  getElement('recordsGrade').value = '10';
  getElement('recordsClass').value = '10A';
  getElement('recordsStatus').value = 'Recorded';
  getElement('recordsFrom').value = '2026-05-01';
  getElement('recordsTo').value = '2026-05-09';
  assert.equal(context.filteredRecordRows().length, 9);
});

test('textbook history includes assignment, return, invoice, payment, credit, and audit events chronologically', () => {
  const { context, getElement } = createExplorer();
  context.textbookCatalogue = [{ BookID: 'BK-01', Title: 'Algebra', Grade: '10', Subject: 'Maths', OriginalPrice_ZAR: 100 }];
  context.db.allocations = [{ allocationId: 'AL-1', learnerNumber: 'L-1', bookId: 'BK-01', invoiceNo: 'INV-1', status: 'Returned', allocationDate: '2026-01-01', lostAt: '2026-02-01', returnedAt: '2026-03-01', price: 100 }];
  context.db.invoices = [{ invoiceNo: 'INV-1', learnerNumber: 'L-1', createdAt: '2026-02-10', items: [{ bookId: 'BK-01', amount: 100 }] }];
  context.db.payments = [{ paymentNo: 'PAY-1', invoiceNo: 'INV-1', learnerNumber: 'L-1', bookId: 'BK-01', amount: 20, createdAt: '2026-02-15' }];
  context.db.adjustments = [{ adjustmentId: 'ADJ-1', invoiceNo: 'INV-1', learnerNumber: 'L-1', bookId: 'BK-01', type: 'RETURN_CREDIT', amount: 80, createdAt: '2026-03-01' }];
  context.db.audit = [{ timestamp: '2026-03-02', action: 'BOOK_RETURNED', learnerNo: 'L-1', bookId: 'BK-01', reference: 'ADJ-1', notes: 'returned' }];
  context.openBookHistory(encodeURIComponent('BK-01'));
  const html = getElement('bookHistoryDetail').innerHTML;
  for (const event of ['Allocated', 'Reported lost', 'Invoice charge', 'Payment', 'Returned', 'Return credit', 'Audit · BOOK_RETURNED']) assert.ok(html.includes(event));
  assert.ok(html.indexOf('Allocated') < html.indexOf('Reported lost'));
  assert.ok(html.indexOf('Reported lost') < html.indexOf('Invoice charge'));
  assert.ok(html.indexOf('Invoice charge') < html.indexOf('Payment'));
});

