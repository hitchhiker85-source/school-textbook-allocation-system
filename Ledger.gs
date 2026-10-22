// Pure invoice arithmetic shared by Apps Script and the browser application.
// Keep all money calculations in integer cents until values are returned.
function ledgerCents_(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) throw new Error('Ledger amounts must be finite numbers.');
  return Math.round((amount + Number.EPSILON) * 100);
}

function ledgerMoney_(cents) {
  return Math.round(cents) / 100;
}

function lineLedger(invoice, bookId, payments, adjustments) {
  const invoiceNo = String(invoice && invoice.invoiceNo || '');
  const line = (invoice && invoice.items || []).find(item => String(item.bookId) === String(bookId));
  if (!invoiceNo || !line) throw new Error('The invoice book line could not be found.');

  const chargedCents = ledgerCents_(line.amount);
  if (chargedCents <= 0) throw new Error('Invoice line amount must be positive.');
  const paidCents = (payments || []).reduce((sum, payment) => {
    if (String(payment.invoiceNo) !== invoiceNo || String(payment.bookId) !== String(bookId)) return sum;
    const cents = ledgerCents_(payment.amount);
    if (cents < 0) throw new Error('Payment amounts cannot be negative.');
    return sum + cents;
  }, 0);
  const creditedCents = (adjustments || []).reduce((sum, adjustment) => {
    if (String(adjustment.invoiceNo) !== invoiceNo || String(adjustment.bookId) !== String(bookId)) return sum;
    if (String(adjustment.type) !== 'RETURN_CREDIT') return sum;
    const cents = ledgerCents_(adjustment.amount);
    if (cents < 0) throw new Error('Credit amounts cannot be negative.');
    return sum + cents;
  }, 0);

  const dueCents = Math.max(0, chargedCents - paidCents - creditedCents);
  let state = 'Open';
  if (dueCents === 0) {
    state = creditedCents > 0 ? 'Credited' : 'Paid';
  } else if (paidCents > 0 || creditedCents > 0) {
    state = 'Part-paid';
  }
  return {
    charged: ledgerMoney_(chargedCents),
    paid: ledgerMoney_(paidCents),
    credited: ledgerMoney_(creditedCents),
    due: ledgerMoney_(dueCents),
    state,
  };
}

function invoiceLedger(invoice, payments, adjustments) {
  const lines = (invoice && invoice.items || []).map(item => ({
    bookId: item.bookId,
    ...lineLedger(invoice, item.bookId, payments, adjustments),
  }));
  const chargedCents = lines.reduce((sum, line) => sum + ledgerCents_(line.charged), 0);
  const paidCents = lines.reduce((sum, line) => sum + ledgerCents_(line.paid), 0);
  const creditedCents = lines.reduce((sum, line) => sum + ledgerCents_(line.credited), 0);
  const dueCents = lines.reduce((sum, line) => sum + ledgerCents_(line.due), 0);
  let status = 'Open';
  if (dueCents === 0) {
    status = creditedCents > 0 && paidCents === 0 ? 'Credited' : creditedCents > 0 ? 'Paid / credited' : 'Paid';
  }
  return {
    charged: ledgerMoney_(chargedCents),
    paid: ledgerMoney_(paidCents),
    credited: ledgerMoney_(creditedCents),
    due: ledgerMoney_(dueCents),
    status,
    lines,
  };
}

function returnCredit(invoice, bookId, payments, adjustments) {
  const invoiceNo = String(invoice && invoice.invoiceNo || '');
  const line = (invoice && invoice.items || []).find(item => String(item.bookId) === String(bookId));
  if (!invoiceNo || !line) throw new Error('The invoice book line could not be found.');
  const priorCredit = (adjustments || []).some(adjustment =>
    String(adjustment.invoiceNo) === invoiceNo &&
    String(adjustment.bookId) === String(bookId) &&
    String(adjustment.type) === 'RETURN_CREDIT'
  );
  if (priorCredit) throw new Error('This invoice book has already been credited.');

  const balance = lineLedger(invoice, bookId, payments, adjustments);
  if (balance.due <= 0) throw new Error('A settled book line cannot be credited.');
  return {
    invoiceNo,
    learnerNumber: String(invoice.learnerNumber || ''),
    bookId: String(bookId),
    type: 'RETURN_CREDIT',
    amount: balance.due,
  };
}

function validateAdjustmentRecords(invoices, allocations, payments, adjustments, existingAdjustments) {
  const invoiceByNo = new Map((invoices || []).map(invoice => [String(invoice.invoiceNo), invoice]));
  const allocationByPair = new Map((allocations || []).map(allocation => [
    String(allocation.learnerNumber) + '|' + String(allocation.bookId), allocation,
  ]));
  const paymentByLine = new Map();
  (payments || []).forEach(payment => {
    const key = String(payment.invoiceNo) + '|' + String(payment.bookId);
    paymentByLine.set(key, (paymentByLine.get(key) || 0) + ledgerCents_(payment.amount));
  });

  const oldById = new Map((existingAdjustments || []).map(adjustment => [String(adjustment.adjustmentId), adjustment]));
  const newById = new Map();
  const creditedLines = new Set();
  const creditsByLine = new Map();
  (adjustments || []).forEach(adjustment => {
    const id = String(adjustment && adjustment.adjustmentId || '').trim();
    const invoiceNo = String(adjustment && adjustment.invoiceNo || '').trim();
    const learnerNumber = String(adjustment && adjustment.learnerNumber || '').trim();
    const allocationId = String(adjustment && adjustment.allocationId || '').trim();
    const bookId = String(adjustment && adjustment.bookId || '').trim();
    const type = String(adjustment && adjustment.type || '').trim();
    if (!id || newById.has(id)) throw new Error('Adjustment IDs must be present and unique.');
    const invoice = invoiceByNo.get(invoiceNo);
    if (!invoice) throw new Error('Adjustment references an unknown invoice: ' + invoiceNo);
    if (String(invoice.learnerNumber) !== learnerNumber) throw new Error('Adjustment learner does not match its invoice.');
    const line = (invoice.items || []).find(item => String(item.bookId) === bookId);
    if (!line) throw new Error('Adjustment must reference a book line on its invoice.');
    const allocation = allocationByPair.get(learnerNumber + '|' + bookId);
    if (!allocation || String(allocation.allocationId) !== allocationId || String(allocation.invoiceNo || '') !== invoiceNo) {
      throw new Error('Adjustment does not match its learner book allocation.');
    }
    if (type !== 'RETURN_CREDIT' || String(allocation.status) !== 'Returned') {
      throw new Error('Only a returned invoiced book can receive a return credit.');
    }
    const amountCents = ledgerCents_(adjustment.amount);
    if (amountCents <= 0) throw new Error('Adjustment amount must be positive.');
    const lineKey = invoiceNo + '|' + bookId;
    if (creditedLines.has(lineKey)) throw new Error('An invoice book cannot be credited more than once.');
    const paidCents = paymentByLine.get(lineKey) || 0;
    const chargeCents = ledgerCents_(line.amount);
    const remainingCents = Math.max(0, chargeCents - paidCents);
    if (Math.abs(amountCents - remainingCents) > 1) throw new Error('Return credit must match the unpaid book balance.');
    creditedLines.add(lineKey);
    creditsByLine.set(lineKey, amountCents);
    newById.set(id, adjustment);
  });

  oldById.forEach((oldAdjustment, id) => {
    const next = newById.get(id);
    if (!next) throw new Error('Existing invoice adjustments are append-only and cannot be removed.');
    ['invoiceNo', 'learnerNumber', 'allocationId', 'bookId', 'type', 'createdAt', 'reference'].forEach(key => {
      if (String(next[key] || '') !== String(oldAdjustment[key] || '')) throw new Error('Existing invoice adjustments are append-only and cannot be edited.');
    });
    if (ledgerCents_(next.amount) !== ledgerCents_(oldAdjustment.amount)) throw new Error('Existing invoice adjustments are append-only and cannot be edited.');
  });

  (payments || []).forEach(payment => {
    const invoice = invoiceByNo.get(String(payment.invoiceNo));
    const line = invoice && (invoice.items || []).find(item => String(item.bookId) === String(payment.bookId));
    if (!line) return;
    const key = String(payment.invoiceNo) + '|' + String(payment.bookId);
    const totalPaid = paymentByLine.get(key) || 0;
    const totalCredited = creditsByLine.get(key) || 0;
    if (totalPaid + totalCredited - ledgerCents_(line.amount) > 1) {
      throw new Error('Payments plus credits cannot exceed the invoiced amount for a book.');
    }
  });
  return true;
}

function invoiceChargeCandidates(allocations) {
  return (allocations || []).filter(allocation =>
    String(allocation.status) === 'Lost' && !String(allocation.invoiceNo || '').trim()
  );
}

function learnerBookSections(allocations) {
  const sections = { held: [], lost: [], returned: [], paidLost: [] };
  (allocations || []).forEach(allocation => {
    const status = String(allocation.status || 'Outstanding');
    if (status === 'Returned') sections.returned.push(allocation);
    else if (status === 'Paid' && allocation.lostAt) sections.paidLost.push(allocation);
    else if (status === 'Lost' || (status === 'Invoiced' && allocation.lostAt)) sections.lost.push(allocation);
    else if (['Outstanding', 'Issued', 'Invoiced'].includes(status)) sections.held.push(allocation);
  });
  return sections;
}
