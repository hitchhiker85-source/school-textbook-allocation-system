const APP_SCHEMA_VERSION = 2;
const APP_SERVER_VERSION = '2026-10-22.2';
const APP_SCHEMA = {
  APP_Learners: { headers: ['learnerNumber', 'firstName', 'surname', 'grade', 'className'], kind: 'master' },
  APP_Classes: { headers: ['grade', 'className'], kind: 'master' },
  APP_Catalogue: { headers: ['bookId', 'grade', 'title', 'subject', 'selectedTitle', 'isbn', 'publisher', 'language', 'component', 'official2027Price', 'price2027Rounded', 'schoolCataloguePrice', 'price', 'priceBasis'], kind: 'master' },
  APP_SubjectChoices: { headers: ['learnerNumber', 'learnerName', 'grade', 'className', 'subject', 'sourceFile', 'matchMethod'], kind: 'master' },
  APP_Allocations: { headers: ['allocationId', 'learnerNumber', 'bookId', 'status', 'allocationDate', 'returnedAt', 'returnNote', 'lostAt', 'paidAt', 'paymentNo', 'invoiceNo', 'price', 'assignedFromCatalogue', 'assignedFromSubject', 'updatedAt', 'recordJson'], kind: 'mutable' },
  APP_Invoices: { headers: ['invoiceNo', 'learnerNumber', 'createdAt', 'total', 'notes', 'itemCount', 'recordJson'], kind: 'mutable' },
  APP_InvoiceItems: { headers: ['invoiceItemId', 'invoiceNo', 'learnerNumber', 'allocationId', 'bookId', 'title', 'amount', 'status', 'recordJson'], kind: 'mutable' },
  APP_Payments: { headers: ['paymentNo', 'invoiceNo', 'learnerNumber', 'bookId', 'amount', 'method', 'reference', 'createdAt', 'notes', 'allocationId', 'recordJson'], kind: 'mutable' },
  APP_InvoiceAdjustments: { headers: ['adjustmentId', 'invoiceNo', 'learnerNumber', 'allocationId', 'bookId', 'type', 'amount', 'createdAt', 'reference', 'recordJson'], kind: 'mutable' },
  APP_Audit: { headers: ['timestamp', 'actor', 'action', 'learnerNo', 'bookId', 'previousState', 'newState', 'reference', 'notes', 'recordJson'], kind: 'mutable' },
  APP_Meta: { headers: ['key', 'value'], kind: 'meta' },
};

function appSpreadsheet_() {
  const spreadsheetId = String(PropertiesService.getScriptProperties().getProperty('APP_SPREADSHEET_ID') || '').trim();
  if (!spreadsheetId) throw new Error('APP_SPREADSHEET_ID is missing from Apps Script Script Properties. Ask the app owner to configure it.');
  return SpreadsheetApp.openById(spreadsheetId);
}

function assertAppOwner_() {
  const activeEmail = String(Session.getActiveUser().getEmail() || '').trim().toLowerCase();
  const ownerEmail = String(Session.getEffectiveUser().getEmail() || '').trim().toLowerCase();
  if (!activeEmail || !ownerEmail || activeEmail !== ownerEmail) throw new Error('Only the spreadsheet owner can run this setup action from the Apps Script editor.');
}

function authorizeSharedSpreadsheetAccess() {
  assertAppOwner_();
  const spreadsheet = appSpreadsheet_();
  const missingTabs = Object.keys(APP_SCHEMA).filter(name => !spreadsheet.getSheetByName(name));
  return { ok: true, spreadsheetName: spreadsheet.getName(), requiredTabCount: Object.keys(APP_SCHEMA).length, missingTabs };
}

function getAppDiagnostics() {
  const spreadsheet = appSpreadsheet_();
  const missingTabs = Object.keys(APP_SCHEMA).filter(name => !spreadsheet.getSheetByName(name));
  const meta = spreadsheet.getSheetByName('APP_Meta');
  const initialized = !!meta && String(readMetaValue_(meta, 'initializationComplete')).toLowerCase() === 'true';
  const rowCounts = {};
  Object.keys(APP_SCHEMA).forEach(name => {
    const sheet = spreadsheet.getSheetByName(name);
    rowCounts[name] = sheet ? Math.max(0, sheet.getLastRow() - 1) : null;
  });
  return {
    ok: true,
    serverVersion: APP_SERVER_VERSION,
    initialized,
    missingTabs,
    rowCounts,
  };
}

function assertSheetHeaders_(sheet, name, headers) {
  if (sheet.getLastRow() < 1) return;
  if (sheet.getLastColumn() !== headers.length) throw new Error(name + ' header does not match the required schema. No spreadsheet tabs were changed.');
  const actual = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
  const valid = headers.every((header, index) => String(actual[index] ?? '').trim() === header);
  if (!valid) throw new Error(name + ' header does not match the required schema. No spreadsheet tabs were changed.');
}

function ensureMetaRows_(sheet) {
  const initial = [
    ['schemaVersion', APP_SCHEMA_VERSION],
    ['revision', 0],
    ['initializedAt', new Date().toISOString()],
    ['nextAllocationId', 1],
    ['nextInvoiceId', 1],
    ['nextInvoiceItemId', 1],
    ['nextPaymentId', 1],
    ['nextAdjustmentId', 1],
    ['initializationComplete', true],
  ];
  const count = Math.max(0, sheet.getLastRow() - 1);
  const existing = count ? sheet.getRange(2, 1, count, 2).getValues() : [];
  const values = new Map();
  existing.forEach(row => {
    const key = String(row[0] ?? '').trim();
    if (!key) return;
    if (values.has(key)) throw new Error('APP_Meta has a duplicate key: ' + key);
    values.set(key, row[1]);
  });
  const storedVersion = values.get('schemaVersion');
  if (storedVersion !== undefined && (!Number.isFinite(Number(storedVersion)) || Number(storedVersion) > APP_SCHEMA_VERSION || Number(storedVersion) < 1)) throw new Error('APP_Meta schemaVersion is incompatible. Review it manually; initialization will not overwrite it.');
  if (storedVersion !== undefined && Number(storedVersion) < APP_SCHEMA_VERSION) {
    if (Number(storedVersion) !== 1) throw new Error('APP_Meta schemaVersion has no supported migration path. Review it manually; initialization will not overwrite it.');
    const versionRow = existing.findIndex(row => String(row[0]) === 'schemaVersion') + 2;
    sheet.getRange(versionRow, 2, 1, 1).setValue(APP_SCHEMA_VERSION);
    values.set('schemaVersion', APP_SCHEMA_VERSION);
  }
  initial.forEach(([key, value]) => {
    if (values.has(key)) {
      if (key === 'initializationComplete' && values.get(key) !== true && String(values.get(key)).toLowerCase() !== 'true') {
        const rowIndex = existing.findIndex(row => String(row[0]) === key) + 2;
        sheet.getRange(rowIndex, 2, 1, 1).setValues([[true]]);
        values.set(key, true);
      }
      return;
    }
    const row = key === 'initializedAt' ? [key, new Date().toISOString()] : [key, value];
    sheet.getRange(sheet.getLastRow() + 1, 1, 1, 2).setValues([row]);
    values.set(key, row[1]);
  });
}

function readMetaValue_(sheet, key) {
  const count = Math.max(0, sheet.getLastRow() - 1);
  if (!count) return null;
  const rows = sheet.getRange(2, 1, count, 2).getValues();
  const row = rows.find(item => String(item[0]) === key);
  return row ? row[1] : null;
}

function initializeAppData() {
  assertAppOwner_();
  const spreadsheet = appSpreadsheet_();
  if (!spreadsheet) throw new Error('Open this script from the target Google Sheet before initializing app data.');

  // Validate every existing APP_ sheet before creating or writing any sheet.
  const sheetPlans = Object.keys(APP_SCHEMA).map(name => {
    const existing = spreadsheet.getSheetByName(name);
    if (existing) assertSheetHeaders_(existing, name, APP_SCHEMA[name].headers);
    return { name, sheet: existing };
  });

  const createdTabs = [];
  sheetPlans.forEach(plan => {
    if (plan.sheet) return;
    plan.sheet = spreadsheet.insertSheet(plan.name);
    plan.sheet.getRange(1, 1, 1, APP_SCHEMA[plan.name].headers.length).setValues([APP_SCHEMA[plan.name].headers]);
    createdTabs.push(plan.name);
  });

  const metaSheet = spreadsheet.getSheetByName('APP_Meta');
  ensureMetaRows_(metaSheet);
  const masterDataCounts = {
    learners: Math.max(0, spreadsheet.getSheetByName('APP_Learners').getLastRow() - 1),
    classes: Math.max(0, spreadsheet.getSheetByName('APP_Classes').getLastRow() - 1),
    catalogue: Math.max(0, spreadsheet.getSheetByName('APP_Catalogue').getLastRow() - 1),
    subjectChoices: Math.max(0, spreadsheet.getSheetByName('APP_SubjectChoices').getLastRow() - 1),
  };
  return {
    ok: true,
    revision: Number(readMetaValue_(metaSheet, 'revision')) || 0,
    createdTabs,
    masterDataCounts,
    requiresOwnerImport: masterDataCounts.learners === 0 || masterDataCounts.catalogue === 0,
  };
}

function doGet(e) {
  const template = HtmlService.createTemplateFromFile('Index');
  const managedLearnerNo = String(e && e.parameter && e.parameter.manageLearner || '');
  template.managedLearnerJson = JSON.stringify(managedLearnerNo).replace(/</g, '\\u003c');
  template.appUrlJson = JSON.stringify(String(ScriptApp.getService().getUrl() || '')).replace(/</g, '\\u003c');
  return template.evaluate().setTitle('Textbook Collection Manager');
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

function readBodyValues_(tableName) {
  const sheet = appSpreadsheet_().getSheetByName(tableName);
  if (!sheet || sheet.getLastRow() < 2) return [];
  const count = sheet.getLastRow() - 1;
  return sheet.getRange(2, 1, count, APP_SCHEMA[tableName].headers.length).getValues()
    .filter(row => row.some(value => value !== '' && value !== null && value !== undefined));
}

function rowToObject_(headers, row) {
  const value = {};
  headers.forEach((header, index) => { value[header] = row[index]; });
  return value;
}

function readSourceRows_(sheetName, requiredHeaders) {
  const sheet = appSpreadsheet_().getSheetByName(sheetName);
  if (!sheet) return null;
  if (sheet.getLastRow() < 1 || sheet.getLastColumn() < requiredHeaders.length) throw new Error('Source sheet ' + sheetName + ' is missing its header row.');
  const sourceHeaders = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(value => String(value || '').trim());
  const missing = requiredHeaders.filter(name => !sourceHeaders.includes(name));
  if (missing.length) throw new Error('Source sheet ' + sheetName + ' is missing required columns: ' + missing.join(', '));
  const bodyCount = Math.max(0, sheet.getLastRow() - 1);
  if (!bodyCount) return [];
  return sheet.getRange(2, 1, bodyCount, sourceHeaders.length).getValues()
    .filter(row => row.some(value => value !== '' && value !== null && value !== undefined))
    .map(row => {
      const result = {};
      sourceHeaders.forEach((header, index) => { if (header && !(header in result)) result[header] = row[index]; });
      return result;
    });
}

function sourceGrade_(value) {
  const match = String(value === null || value === undefined ? '' : value).trim().match(/(?:grade\s*)?(8|9|10|11|12)\b/i);
  return match ? match[1] : String(value === null || value === undefined ? '' : value).trim();
}

function sourceSeedTable_(tableName) {
  if (tableName === 'APP_Learners') {
    const rows = readSourceRows_('All Learners', ['LearnerNumber', 'FirstName', 'Surname', 'Grade', 'Class']);
    if (rows === null) return null;
    return rows.filter(row => String(row.LearnerNumber || '').trim()).map(row => ({
      learnerNumber: String(row.LearnerNumber).trim(), firstName: String(row.FirstName || '').trim(), surname: String(row.Surname || '').trim(),
      grade: sourceGrade_(row.Grade), className: String(row.Class || '').trim(),
    }));
  }
  if (tableName === 'APP_Catalogue') {
    const rows = readSourceRows_('Catalogue', ['Grade', 'Book ID', 'School Catalogue Title', 'Subject', 'Selected EC Catalogue Title', 'ISBN', 'EC Publisher', 'EC Language', 'EC Component', 'EC Official 2027 Price (R)', 'EC Price Rounded Up to Next R10 (R)', 'Original School Catalogue Price (R)']);
    if (rows === null) return null;
    return rows.filter(row => String(row['Book ID'] || '').trim()).map(row => {
      const selectedTitle = String(row['Selected EC Catalogue Title'] || '').trim();
      const official = Number(row['EC Official 2027 Price (R)']) || 0;
      const rounded = Number(row['EC Price Rounded Up to Next R10 (R)']) || 0;
      const schoolPrice = Number(row['Original School Catalogue Price (R)']) || 0;
      return {
        bookId: String(row['Book ID']).trim(), grade: sourceGrade_(row.Grade), title: String(row['School Catalogue Title'] || '').trim(), subject: String(row.Subject || '').trim(),
        selectedTitle, isbn: String(row.ISBN || '').trim(), publisher: String(row['EC Publisher'] || '').trim(), language: String(row['EC Language'] || '').trim(),
        component: String(row['EC Component'] || '').trim(), official2027Price: official, price2027Rounded: rounded, schoolCataloguePrice: schoolPrice,
        price: selectedTitle ? rounded : schoolPrice, priceBasis: selectedTitle ? '2027 rounded' : 'school catalogue fallback',
      };
    });
  }
  if (tableName === 'APP_SubjectChoices') {
    const rows = readSourceRows_('SubjectChoices', ['LearnerNumber', 'LearnerName', 'Grade', 'Class', 'Subject', 'SourceFile', 'MatchMethod']);
    if (rows === null) return null;
    return rows.filter(row => String(row.LearnerNumber || '').trim()).map(row => ({
      learnerNumber: String(row.LearnerNumber).trim(), learnerName: String(row.LearnerName || '').trim(), grade: sourceGrade_(row.Grade),
      className: String(row.Class || '').trim(), subject: String(row.Subject || '').trim(), sourceFile: String(row.SourceFile || '').trim(), matchMethod: String(row.MatchMethod || '').trim(),
    }));
  }
  return null;
}

function parseStoredRecord_(row, headerIndex) {
  const raw = row[headerIndex.recordJson];
  if (raw) {
    try { return JSON.parse(String(raw)); } catch (error) { throw new Error('A stored record contains invalid JSON.'); }
  }
  return {};
}

function readSeedTable_(tableName) {
  const appSheet = appSpreadsheet_().getSheetByName(tableName);
  if (appSheet) {
    const headers = APP_SCHEMA[tableName].headers;
    return readBodyValues_(tableName).map(row => rowToObject_(headers, row));
  }
  const sourceRows = sourceSeedTable_(tableName);
  if (sourceRows !== null) return sourceRows;
  const headers = APP_SCHEMA[tableName].headers;
  return readBodyValues_(tableName).map(row => rowToObject_(headers, row));
}

function readAllocations_() {
  const headers = APP_SCHEMA.APP_Allocations.headers;
  const index = Object.fromEntries(headers.map((name, position) => [name, position]));
  return readBodyValues_('APP_Allocations').map(row => ({
    ...parseStoredRecord_(row, index), allocationId: String(row[index.allocationId] || ''), learnerNumber: String(row[index.learnerNumber] || ''),
    bookId: String(row[index.bookId] || ''), status: String(row[index.status] || ''), allocationDate: row[index.allocationDate] || '',
    returnedAt: row[index.returnedAt] || '', returnNote: row[index.returnNote] || '', lostAt: row[index.lostAt] || '', paidAt: row[index.paidAt] || '',
    paymentNo: row[index.paymentNo] || '', invoiceNo: row[index.invoiceNo] || '', price: Number(row[index.price]) || 0,
    assignedFromCatalogue: row[index.assignedFromCatalogue] === true || String(row[index.assignedFromCatalogue]).toLowerCase() === 'true',
    assignedFromSubject: row[index.assignedFromSubject] || '', updatedAt: row[index.updatedAt] || '',
  }));
}

function readInvoices_() {
  const invoiceHeaders = APP_SCHEMA.APP_Invoices.headers;
  const invoiceIndex = Object.fromEntries(invoiceHeaders.map((name, position) => [name, position]));
  const itemHeaders = APP_SCHEMA.APP_InvoiceItems.headers;
  const itemIndex = Object.fromEntries(itemHeaders.map((name, position) => [name, position]));
  const itemsByInvoice = new Map();
  readBodyValues_('APP_InvoiceItems').forEach(row => {
    const invoiceNo = String(row[itemIndex.invoiceNo] || '');
    if (!itemsByInvoice.has(invoiceNo)) itemsByInvoice.set(invoiceNo, []);
    itemsByInvoice.get(invoiceNo).push({
      ...parseStoredRecord_(row, itemIndex), bookId: String(row[itemIndex.bookId] || ''), title: String(row[itemIndex.title] || ''), amount: Number(row[itemIndex.amount]) || 0,
    });
  });
  return readBodyValues_('APP_Invoices').map(row => ({
    ...parseStoredRecord_(row, invoiceIndex), invoiceNo: String(row[invoiceIndex.invoiceNo] || ''), learnerNumber: String(row[invoiceIndex.learnerNumber] || ''),
    createdAt: row[invoiceIndex.createdAt] || '', items: itemsByInvoice.get(String(row[invoiceIndex.invoiceNo] || '')) || [],
    total: Number(row[invoiceIndex.total]) || 0, notes: row[invoiceIndex.notes] || '',
  }));
}

function readPayments_() {
  const headers = APP_SCHEMA.APP_Payments.headers;
  const index = Object.fromEntries(headers.map((name, position) => [name, position]));
  return readBodyValues_('APP_Payments').map(row => ({
    ...parseStoredRecord_(row, index), paymentNo: String(row[index.paymentNo] || ''), invoiceNo: String(row[index.invoiceNo] || ''),
    learnerNumber: String(row[index.learnerNumber] || ''), bookId: String(row[index.bookId] || ''), amount: Number(row[index.amount]) || 0,
    method: row[index.method] || '', reference: row[index.reference] || '', createdAt: row[index.createdAt] || '', notes: row[index.notes] || '',
  }));
}

function readAdjustments_() {
  const sheet = appSpreadsheet_().getSheetByName('APP_InvoiceAdjustments');
  if (!sheet) return [];
  const headers = APP_SCHEMA.APP_InvoiceAdjustments.headers;
  const index = Object.fromEntries(headers.map((name, position) => [name, position]));
  return readBodyValues_('APP_InvoiceAdjustments').map(row => ({
    ...parseStoredRecord_(row, index), adjustmentId: String(row[index.adjustmentId] || ''),
    invoiceNo: String(row[index.invoiceNo] || ''), learnerNumber: String(row[index.learnerNumber] || ''),
    allocationId: String(row[index.allocationId] || ''), bookId: String(row[index.bookId] || ''),
    type: String(row[index.type] || ''), amount: Number(row[index.amount]) || 0,
    createdAt: row[index.createdAt] || '', reference: row[index.reference] || '',
  }));
}

function readAudit_() {
  const headers = APP_SCHEMA.APP_Audit.headers;
  const index = Object.fromEntries(headers.map((name, position) => [name, position]));
  return readBodyValues_('APP_Audit').map(row => ({
    ...parseStoredRecord_(row, index), timestamp: row[index.timestamp] || '', actor: row[index.actor] || '', action: row[index.action] || '', learnerNo: row[index.learnerNo] || '',
    bookId: row[index.bookId] || '', previousState: row[index.previousState] || '', newState: row[index.newState] || '', reference: row[index.reference] || '', notes: row[index.notes] || '',
  }));
}

function catalogueForClient_() {
  return readSeedTable_('APP_Catalogue').map(book => ({
    BookID: book.bookId, Grade: String(book.grade), Title: book.title, Subject: book.subject, ISBN: book.isbn, Publisher: book.publisher,
    Language: book.language, Component: book.component, OriginalPrice_ZAR: Number(book.price) || 0, Official2027Price_ZAR: book.official2027Price,
    EC_SelectedTitle: book.selectedTitle, PriceBasis: book.priceBasis,
  }));
}

function appSnapshot_() {
  const ss = appSpreadsheet_();
  const meta = ss.getSheetByName('APP_Meta');
  if (!meta || String(readMetaValue_(meta, 'initializationComplete')).toLowerCase() !== 'true') throw new Error('App data is not initialized. Run initializeAppData() from the linked spreadsheet first.');
  const seq = {
    allocation: Number(readMetaValue_(meta, 'nextAllocationId')) || 1,
    invoice: Number(readMetaValue_(meta, 'nextInvoiceId')) || 1,
    payment: Number(readMetaValue_(meta, 'nextPaymentId')) || 1,
    adjustment: Number(readMetaValue_(meta, 'nextAdjustmentId')) || 1,
  };
  return {
    revision: Number(readMetaValue_(meta, 'revision')) || 0,
    state: {
      learners: readSeedTable_('APP_Learners'), catalogue: catalogueForClient_(), subjectChoices: readSeedTable_('APP_SubjectChoices'),
      allocations: readAllocations_(), invoices: readInvoices_(), payments: readPayments_(),
      adjustments: readAdjustments_(), audit: readAudit_(), seq,
    },
  };
}

function textbookAppLoadDataV215() {
  const lock = LockService.getScriptLock();
  if (!lock || !lock.tryLock(30000)) return { ok: false, code: 'BUSY', message: 'Another staff member is saving changes. Wait a moment and try again.' };
  try {
    const snapshot = appSnapshot_();
    return { ok: true, revision: snapshot.revision, state: snapshot.state };
  } catch (error) {
    return { ok: false, code: 'LOAD_FAILED', message: String(error && error.message || error) };
  } finally {
    lock.releaseLock();
  }
}

function textbookAppLoadDataV217() {
  const lock = LockService.getScriptLock();
  if (!lock || !lock.tryLock(30000)) return JSON.stringify({ ok: false, code: 'BUSY', message: 'Another staff member is saving changes. Wait a moment and try again.' });
  try {
    const snapshot = appSnapshot_();
    return JSON.stringify({ ok: true, revision: snapshot.revision, state: snapshot.state });
  } catch (error) {
    return JSON.stringify({ ok: false, code: 'LOAD_FAILED', message: String(error && error.message || error) });
  } finally {
    lock.releaseLock();
  }
}

function numericValue_(value, label, allowZero) {
  const result = Number(value);
  if (!isFinite(result) || result < 0 || (!allowZero && result <= 0)) throw new Error(label + ' must be a valid ' + (allowZero ? 'non-negative' : 'positive') + ' amount.');
  return result;
}

function validateState_(state) {
  if (!state || typeof state !== 'object') throw new Error('Save payload is missing state data.');
  ['allocations', 'invoices', 'payments', 'audit'].forEach(key => { if (!Array.isArray(state[key])) throw new Error('Save payload must include an ' + key + ' array.'); });
  if (!state.seq || typeof state.seq !== 'object') throw new Error('Save payload is missing sequence counters.');
  if (!Array.isArray(state.adjustments)) state.adjustments = readAdjustments_();
  if (!Number.isSafeInteger(Number(state.seq.adjustment)) || Number(state.seq.adjustment) < 1) {
    const meta = appSpreadsheet_().getSheetByName('APP_Meta');
    state.seq.adjustment = Number(readMetaValue_(meta, 'nextAdjustmentId')) || 1;
  }
  if (state.allocations.length > 50000 || state.invoices.length > 20000 || state.payments.length > 100000 || state.audit.length > 20000 || state.adjustments.length > 100000) throw new Error('Save payload exceeds the supported record limit.');

  const learners = new Set(readSeedTable_('APP_Learners').map(row => String(row.learnerNumber)));
  const catalogue = new Map(readSeedTable_('APP_Catalogue').map(row => [String(row.bookId), row]));
  const allocationIds = new Set();
  const allocationPairs = new Set();
  const allocationByPair = new Map();
  const allowedStatuses = new Set(['Outstanding', 'Issued', 'Invoiced', 'Lost', 'Returned', 'Paid']);
  state.allocations.forEach(item => {
    const id = String(item && item.allocationId || '').trim(), learner = String(item && item.learnerNumber || '').trim(), bookId = String(item && item.bookId || '').trim();
    if (!id || allocationIds.has(id)) throw new Error('Allocation IDs must be present and unique.');
    if (!learners.has(learner)) throw new Error('Allocation references an unknown learner: ' + learner);
    if (!catalogue.has(bookId)) throw new Error('Allocation references an unknown catalogue book: ' + bookId);
    if (!allowedStatuses.has(String(item.status || 'Outstanding'))) throw new Error('Allocation has an unsupported status: ' + item.status);
    numericValue_(item.price, 'Allocation price', true);
    const pair = learner + '|' + bookId;
    if (allocationPairs.has(pair)) throw new Error('A learner cannot have duplicate allocations for the same catalogue book.');
    allocationIds.add(id); allocationPairs.add(pair); allocationByPair.set(pair, item);
  });

  const invoiceMap = new Map();
  const invoicedAllocations = new Set();
  state.invoices.forEach(invoice => {
    const id = String(invoice && invoice.invoiceNo || '').trim(), learner = String(invoice && invoice.learnerNumber || '').trim();
    if (!id || invoiceMap.has(id)) throw new Error('Invoice numbers must be present and unique.');
    if (!learners.has(learner)) throw new Error('Invoice references an unknown learner: ' + learner);
    if (!Array.isArray(invoice.items) || !invoice.items.length) throw new Error('Every invoice must have at least one book line.');
    const itemBooks = new Set();
    let calculatedTotal = 0;
    invoice.items.forEach(line => {
      const bookId = String(line && line.bookId || '').trim();
      if (!catalogue.has(bookId)) throw new Error('Invoice references an unknown catalogue book: ' + bookId);
      if (itemBooks.has(bookId)) throw new Error('An invoice cannot contain the same book more than once.');
      const allocation = allocationByPair.get(learner + '|' + bookId);
      if (!allocation) throw new Error('Invoice line has no matching learner book allocation: ' + bookId);
      if (String(allocation.invoiceNo || '') !== id) throw new Error('Allocation invoice reference does not match invoice ' + id + '.');
      const allocationKey = learner + '|' + bookId;
      if (invoicedAllocations.has(allocationKey)) throw new Error('A learner book allocation cannot appear on more than one invoice.');
      invoicedAllocations.add(allocationKey);
      numericValue_(line.amount, 'Invoice line amount', false);
      calculatedTotal += Number(line.amount);
      itemBooks.add(bookId);
    });
    const total = numericValue_(invoice.total, 'Invoice total', true);
    if (Math.abs(total - calculatedTotal) > 0.011) throw new Error('Invoice total does not match its book lines: ' + id);
    invoiceMap.set(id, invoice);
  });

  const paymentIds = new Set();
  const paidByInvoiceBook = new Map();
  state.payments.forEach(payment => {
    const id = String(payment && payment.paymentNo || '').trim(), invoiceNo = String(payment && payment.invoiceNo || '').trim();
    const invoice = invoiceMap.get(invoiceNo);
    if (!id || paymentIds.has(id)) throw new Error('Payment numbers must be present and unique.');
    if (!invoice) throw new Error('Payment references an unknown invoice: ' + invoiceNo);
    if (String(payment.learnerNumber) !== String(invoice.learnerNumber)) throw new Error('Payment learner does not match its invoice.');
    const line = invoice.items.find(item => String(item.bookId) === String(payment.bookId));
    if (!line) throw new Error('Payment must reference a book line on its invoice.');
    const amount = numericValue_(payment.amount, 'Payment', false);
    const key = invoiceNo + '|' + String(payment.bookId);
    const paid = (paidByInvoiceBook.get(key) || 0) + amount;
    if (paid - Number(line.amount) > 0.011) throw new Error('Payments cannot exceed the invoiced amount for a book.');
    paidByInvoiceBook.set(key, paid); paymentIds.add(id);
  });
  validateAdjustmentRecords(state.invoices, state.allocations, state.payments, state.adjustments, readAdjustments_());
  if (state.audit.some(record => !record || typeof record !== 'object' || !record.action)) throw new Error('Audit records must include an action.');
  ['allocation', 'invoice', 'payment', 'adjustment'].forEach(key => { if (!Number.isSafeInteger(Number(state.seq[key])) || Number(state.seq[key]) < 1) throw new Error('Sequence counter ' + key + ' must be a positive integer.'); });
}

function recordJson_(record) {
  return JSON.stringify(record || {});
}

function rowsForMutableState_(state) {
  const allocations = state.allocations.map(item => [
    item.allocationId, item.learnerNumber, item.bookId, item.status || 'Outstanding', item.allocationDate || '', item.returnedAt || '', item.returnNote || '',
    item.lostAt || '', item.paidAt || '', item.paymentNo || '', item.invoiceNo || '', Number(item.price) || 0, !!item.assignedFromCatalogue,
    item.assignedFromSubject || '', item.updatedAt || '', recordJson_(item),
  ]);
  const invoices = [];
  const invoiceItems = [];
  state.invoices.forEach(invoice => {
    const { items, ...header } = invoice;
    invoices.push([invoice.invoiceNo, invoice.learnerNumber, invoice.createdAt || '', Number(invoice.total) || 0, invoice.notes || '', items.length, recordJson_(header)]);
    items.forEach((item, position) => {
      const allocation = state.allocations.find(row => String(row.learnerNumber) === String(invoice.learnerNumber) && String(row.bookId) === String(item.bookId));
      const itemId = String(invoice.invoiceNo) + '::' + String(item.bookId) + '::' + (position + 1);
      invoiceItems.push([itemId, invoice.invoiceNo, invoice.learnerNumber, allocation ? allocation.allocationId : '', item.bookId, item.title || '', Number(item.amount) || 0, allocation ? allocation.status : '', recordJson_(item)]);
    });
  });
  const payments = state.payments.map(item => {
    const allocation = state.allocations.find(row => String(row.learnerNumber) === String(item.learnerNumber) && String(row.bookId) === String(item.bookId));
    return [item.paymentNo, item.invoiceNo, item.learnerNumber, item.bookId || '', Number(item.amount) || 0, item.method || '', item.reference || '', item.createdAt || '', item.notes || '', allocation ? allocation.allocationId : '', recordJson_(item)];
  });
  const adjustments = (state.adjustments || []).map(item => [
    item.adjustmentId, item.invoiceNo, item.learnerNumber, item.allocationId, item.bookId,
    item.type, Number(item.amount) || 0, item.createdAt || '', item.reference || '', recordJson_(item),
  ]);
  return { APP_Allocations: allocations, APP_Invoices: invoices, APP_InvoiceItems: invoiceItems, APP_Payments: payments, APP_InvoiceAdjustments: adjustments };
}

function replaceBodyRows_(tableName, rows) {
  const sheet = appSpreadsheet_().getSheetByName(tableName);
  const columns = APP_SCHEMA[tableName].headers.length;
  const oldRows = Math.max(0, sheet.getLastRow() - 1);
  if (rows.length) sheet.getRange(2, 1, rows.length, columns).setValues(rows);
  if (oldRows > rows.length) sheet.getRange(rows.length + 2, 1, oldRows - rows.length, columns).clearContent();
}

function setMetaValue_(sheet, key, value) {
  const count = Math.max(0, sheet.getLastRow() - 1);
  const existing = count ? sheet.getRange(2, 1, count, 2).getValues() : [];
  const index = existing.findIndex(row => String(row[0]) === key);
  if (index < 0) sheet.getRange(sheet.getLastRow() + 1, 1, 1, 2).setValues([[key, value]]);
  else sheet.getRange(index + 2, 2, 1, 1).setValues([[value]]);
}

function appendNewAudit_(newEvents) {
  const sheet = appSpreadsheet_().getSheetByName('APP_Audit');
  const existingRows = readBodyValues_('APP_Audit');
  const index = Object.fromEntries(APP_SCHEMA.APP_Audit.headers.map((name, position) => [name, position]));
  const known = new Set(existingRows.map(row => String(row[index.recordJson] || '')));
  const rows = [];
  newEvents.forEach(event => {
    const serialized = recordJson_(event);
    if (known.has(serialized)) return;
    known.add(serialized);
    rows.push([event.timestamp || new Date().toISOString(), 'Anonymous link user', event.action || '', event.learnerNo || event.learnerNumber || '', event.bookId || '', event.previousState || '', event.newState || '', event.reference || '', event.notes || '', serialized]);
  });
  if (rows.length) {
    for (let start = 0; start < rows.length; start += 200) {
      const chunk = rows.slice(start, start + 200);
      sheet.getRange(sheet.getLastRow() + 1, 1, chunk.length, APP_SCHEMA.APP_Audit.headers.length).setValues(chunk);
    }
  }
}

function textbookAppSaveDataV215(request) {
  const lock = LockService.getScriptLock();
  if (!lock || !lock.tryLock(30000)) return { ok: false, code: 'BUSY', message: 'Another staff member is saving changes. Wait a moment and try again.' };
  try {
    const snapshot = appSnapshot_();
    if (Number(request && request.baseRevision) !== snapshot.revision) return { ok: false, conflict: true, code: 'CONFLICT', message: 'The shared data changed in another session. Reload the latest data before continuing.', revision: snapshot.revision, state: snapshot.state };
    const state = request && request.state;
    validateState_(state);
    const nextRows = rowsForMutableState_(state);
    const tableNames = ['APP_Allocations', 'APP_Invoices', 'APP_InvoiceItems', 'APP_Payments', 'APP_InvoiceAdjustments'];
    const before = Object.fromEntries(tableNames.map(name => [name, readBodyValues_(name)]));
    const meta = appSpreadsheet_().getSheetByName('APP_Meta');
    const oldMeta = readBodyValues_('APP_Meta');
    const oldAudit = readBodyValues_('APP_Audit');
    try {
      tableNames.forEach(name => replaceBodyRows_(name, nextRows[name]));
      appendNewAudit_(state.audit);
      setMetaValue_(meta, 'nextAllocationId', Number(state.seq.allocation));
      setMetaValue_(meta, 'nextInvoiceId', Number(state.seq.invoice));
      setMetaValue_(meta, 'nextPaymentId', Number(state.seq.payment));
      setMetaValue_(meta, 'nextAdjustmentId', Number(state.seq.adjustment));
      const nextRevision = snapshot.revision + 1;
      setMetaValue_(meta, 'revision', nextRevision);
      return { ok: true, revision: nextRevision };
    } catch (writeError) {
      tableNames.slice().reverse().forEach(name => {
        try { replaceBodyRows_(name, before[name]); } catch (rollbackError) { console.error('Rollback failed for ' + name, rollbackError); }
      });
      try { replaceBodyRows_('APP_Audit', oldAudit); } catch (rollbackError) { console.error('Audit rollback failed', rollbackError); }
      try { replaceBodyRows_('APP_Meta', oldMeta); } catch (rollbackError) { console.error('Metadata rollback failed', rollbackError); }
      return { ok: false, code: 'SAVE_FAILED', message: 'The spreadsheet could not save this change. The app has kept the current screen open; retry after checking the connection.' };
    }
  } catch (error) {
    return { ok: false, code: 'VALIDATION', message: String(error && error.message || error) };
  } finally {
    lock.releaseLock();
  }
}

function textbookAppResetTransactionsV221() {
  const lock = LockService.getScriptLock();
  if (!lock || !lock.tryLock(30000)) return JSON.stringify({ ok: false, code: 'BUSY', message: 'Another staff member is saving changes. Wait a moment and try again.' });
  const transactionTables = ['APP_Allocations', 'APP_Invoices', 'APP_InvoiceItems', 'APP_Payments', 'APP_InvoiceAdjustments', 'APP_Audit'];
  try {
    const snapshot = appSnapshot_();
    const previousRows = Object.fromEntries(transactionTables.map(name => [name, readBodyValues_(name)]));
    const meta = appSpreadsheet_().getSheetByName('APP_Meta');
    const previousMeta = readBodyValues_('APP_Meta');
    try {
      transactionTables.forEach(name => replaceBodyRows_(name, []));
      setMetaValue_(meta, 'nextAllocationId', 1);
      setMetaValue_(meta, 'nextInvoiceId', 1);
      setMetaValue_(meta, 'nextPaymentId', 1);
      setMetaValue_(meta, 'nextAdjustmentId', 1);
      const revision = snapshot.revision + 1;
      setMetaValue_(meta, 'revision', revision);
      return JSON.stringify({ ok: true, revision });
    } catch (writeError) {
      transactionTables.slice().reverse().forEach(name => {
        try { replaceBodyRows_(name, previousRows[name]); } catch (rollbackError) { console.error('Reset rollback failed for ' + name, rollbackError); }
      });
      try { replaceBodyRows_('APP_Meta', previousMeta); } catch (rollbackError) { console.error('Reset metadata rollback failed', rollbackError); }
      return JSON.stringify({ ok: false, code: 'RESET_FAILED', message: 'The shared records could not all be cleared; the app attempted to restore the previous data.' });
    }
  } catch (error) {
    return JSON.stringify({ ok: false, code: 'RESET_FAILED', message: String(error && error.message || error) });
  } finally {
    lock.releaseLock();
  }
}

