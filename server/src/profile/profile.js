// Builds a pre-fill suggestion and data-quality summary from one customer's
// sample-data folder. Pure: takes the folder id and the raw CSV texts.
const { parseCsv, toRecords } = require('./csv');
const { CLIENT_FIELDS, CONTACT_FIELDS, headerKey, mapColumns, detectSchemaStyle, detectDateFormat, parseDate } = require('./schema');
const {
  normaliseEntityType, normaliseClientStatus, normaliseContactStatus, normaliseIndustry,
  normalisePaymentTerms, normalisePersonName, parseAmount, isValidEmail
} = require('./normalise');

const FILES = {
  clients: 'clients.csv',
  contacts: 'contacts.csv',
  chartOfAccounts: 'chart_of_accounts.csv',
  transactions: 'transactions.csv'
};

// "CustomerA_ABCAccounting" -> "ABC Accounting".
function labelFromFolder(id) {
  return String(id)
    .replace(/^Customer[A-Z0-9]*_/, '')
    .replace(/_/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim();
}

const CUSTOMER_INDUSTRIES = [
  [/bookkeep/i, 'Bookkeeping'],
  [/financial services/i, 'Financial Services'],
  [/accountan|accounting/i, 'Accounting'],
  [/\btax\b/i, 'Tax Services'],
  [/audit/i, 'Audit']
];

function industryFromLabel(label) {
  return CUSTOMER_INDUSTRIES.find(([pattern]) => pattern.test(label))?.[1] ?? '';
}

// A merged overflow is only trusted when it reads like "Last, First": a single
// comma and no digits (so shifted codes, amounts or dates are never accepted).
const looksLikeLastFirstName = value => /^[^,\d]+,\s*[^,\d]+$/.test(value);

// Parses one CSV; when `fields` (canonical field -> aliases) is given, also maps
// its columns so issues can name canonical fields rather than source headers.
// `mergeField` is the canonical field allowed to absorb an unquoted-comma
// overflow when it is the last column (see toRecords).
function loadFile(file, text, fields, mergeField) {
  if (text == null) {
    return {
      missing: true, header: [], records: [], mapping: {},
      issues: [{ file, row: 0, field: '', severity: 'error', message: `${file} is missing from the sample-data folder.` }]
    };
  }
  const rows = parseCsv(text);
  const header = (rows[0] ?? []).map(h => h.trim());
  const mapping = fields ? mapColumns(header, fields) : {};
  const reverse = Object.fromEntries(Object.entries(mapping).filter(([, h]) => h).map(([f, h]) => [h, f]));
  const mergeInto = mergeField ? mapping[mergeField] : undefined;
  return {
    missing: false, mapping,
    ...toRecords(rows, { file, fieldFor: h => reverse[h] ?? h, mergeInto, acceptMerge: looksLikeLastFirstName })
  };
}

function missingColumnIssues(file, mapping, required) {
  return required.filter(field => !mapping[field]).map(field => ({
    file, row: 0, field, severity: 'error', message: `No column found for ${field}.`
  }));
}

function majority(values, predicate) {
  return values.length > 0 && values.filter(predicate).length > values.length / 2;
}

const TAX_ID_PATTERNS = [/^\d{2}-\d{7}$/, /^GB\d{9}$/i];

function profileClients(file, parsed, mapping, dateFormat) {
  const issues = [];
  const issue = (row, field, severity, message) => issues.push({ file, row, field, severity, message });
  const seen = new Map();

  const clients = parsed.records.map(({ row, values, malformed }) => {
    const get = field => (mapping[field] ? values[mapping[field]] : '') ?? '';
    const client = {
      id: get('id'),
      name: get('name'),
      entityType: get('entityType'),
      status: get('status'),
      startDate: null,
      taxId: get('taxId'),
      annualRevenue: null,
      industry: normaliseIndustry(get('industry')),
      paymentTerms: normalisePaymentTerms(get('paymentTerms')),
      primaryContact: normalisePersonName(get('primaryContact'))
    };

    if (!client.id) issue(row, 'id', 'error', 'Client ID is missing.');
    else if (seen.has(client.id)) issue(row, 'id', 'error', `Duplicate client ID "${client.id}" (first seen on row ${seen.get(client.id)}).`);
    else seen.set(client.id, row);
    // The row could not be split into columns (already reported); keep only its ID.
    if (malformed) return client;

    if (!client.name) issue(row, 'name', 'error', 'Client name is missing.');

    const entity = normaliseEntityType(client.entityType);
    if (entity) client.entityType = entity;
    else if (client.entityType) issue(row, 'entityType', 'warning', `Unrecognised entity type "${client.entityType}".`);
    else issue(row, 'entityType', 'warning', 'Entity type is missing.');

    const status = normaliseClientStatus(client.status);
    if (status) client.status = status;
    else if (client.status) issue(row, 'status', 'warning', `Unrecognised status "${client.status}".`);
    else issue(row, 'status', 'warning', 'Status is missing.');

    const rawDate = get('startDate');
    if (rawDate) {
      client.startDate = parseDate(rawDate, dateFormat);
      if (!client.startDate) issue(row, 'startDate', 'error', `Start date "${rawDate}" is not a valid ${dateFormat} date.`);
    } else {
      issue(row, 'startDate', 'warning', 'Start date is missing.');
    }

    if (client.taxId && !TAX_ID_PATTERNS.some(p => p.test(client.taxId))) {
      issue(row, 'taxId', 'warning', `Tax ID "${client.taxId}" does not look like a US EIN (12-3456789) or UK reference (GB123456789).`);
    }

    const revenue = parseAmount(get('annualRevenue'));
    if (Number.isNaN(revenue)) issue(row, 'annualRevenue', 'error', `Annual revenue "${get('annualRevenue')}" is not a number.`);
    else if (revenue != null && revenue < 0) issue(row, 'annualRevenue', 'warning', 'Annual revenue is negative.');
    client.annualRevenue = Number.isNaN(revenue) ? null : revenue;

    return client;
  });
  return { clients, issues };
}

function profileContacts(file, parsed, mapping, clientIds) {
  const issues = [];
  const issue = (row, field, severity, message) => issues.push({ file, row, field, severity, message });
  const seen = new Map();

  const contacts = parsed.records.map(({ row, values, malformed }) => {
    const get = field => (mapping[field] ? values[mapping[field]] : '') ?? '';
    const contact = {
      id: get('id'), clientId: get('clientId'), firstName: get('firstName'), lastName: get('lastName'),
      email: get('email'), phone: get('phone'), role: get('role'), status: get('status')
    };

    if (!contact.id) issue(row, 'id', 'error', 'Contact ID is missing.');
    else if (seen.has(contact.id)) issue(row, 'id', 'error', `Duplicate contact ID "${contact.id}" (first seen on row ${seen.get(contact.id)}).`);
    else seen.set(contact.id, row);
    // The row could not be split into columns (already reported); keep only its ID.
    if (malformed) return contact;

    if (!contact.clientId) issue(row, 'clientId', 'error', 'Client ID is missing.');
    else if (!clientIds.has(contact.clientId)) issue(row, 'clientId', 'error', `Contact references unknown client "${contact.clientId}".`);

    if (!contact.firstName && !contact.lastName) issue(row, 'firstName', 'error', 'Contact name is missing.');

    if (!contact.email) issue(row, 'email', 'warning', 'Email is missing.');
    else if (!isValidEmail(contact.email)) issue(row, 'email', 'error', `Email "${contact.email}" is not valid.`);

    const status = normaliseContactStatus(contact.status);
    if (status) contact.status = status;
    else if (contact.status) issue(row, 'status', 'warning', `Unrecognised contact status "${contact.status}".`);

    return contact;
  });
  return { contacts, issues };
}

function crossCheckIssues(file, parsed, clients, contacts) {
  const issues = [];
  clients.forEach((client, index) => {
    const { row, malformed } = parsed.records[index];
    if (!client.id || malformed) return;
    const own = contacts.filter(c => c.clientId === client.id);
    if (!own.length) {
      issues.push({ file, row, field: 'id', severity: 'warning', message: `Client "${client.id}" has no contacts.` });
      return;
    }
    const wanted = client.primaryContact.toLowerCase();
    if (wanted && !own.some(c => `${c.firstName} ${c.lastName}`.trim().toLowerCase() === wanted)) {
      issues.push({ file, row, field: 'primaryContact', severity: 'warning', message: `Primary contact "${client.primaryContact}" is not among this client's contacts.` });
    }
  });
  return issues;
}

function detectCurrency(headers, region) {
  const keys = headers.map(headerKey);
  if (keys.some(k => k.includes('gbp'))) return 'GBP';
  if (keys.some(k => k.includes('usd'))) return 'USD';
  return region === 'United Kingdom' ? 'GBP' : 'USD';
}

// Region is a vote over data signals: currency in column names, GB tax
// references, +44 phone numbers and day-first dates.
function detectRegion({ headers, clients, contacts, dateFormat }) {
  const keys = headers.map(headerKey);
  const signals = [
    keys.some(k => k.includes('gbp')),
    majority(clients.map(c => c.taxId).filter(Boolean), t => /^GB/i.test(t)),
    majority(contacts.map(c => c.phone).filter(Boolean), p => /^\+44/.test(p)),
    dateFormat === 'DD-MM-YYYY'
  ];
  return signals.filter(Boolean).length >= 2 ? 'United Kingdom' : 'North America';
}

function buildProfile(id, files) {
  const label = labelFromFolder(id);

  const clientsParsed = loadFile(FILES.clients, files[FILES.clients], CLIENT_FIELDS, 'primaryContact');
  const contactsParsed = loadFile(FILES.contacts, files[FILES.contacts], CONTACT_FIELDS);
  const coaParsed = loadFile(FILES.chartOfAccounts, files[FILES.chartOfAccounts]);
  const txParsed = loadFile(FILES.transactions, files[FILES.transactions]);
  const clientMap = clientsParsed.mapping;
  const contactMap = contactsParsed.mapping;

  const dateValues = [
    ...clientsParsed.records.map(r => r.values[clientMap.startDate]),
    ...txParsed.header.filter(h => headerKey(h).includes('date')).flatMap(h => txParsed.records.map(r => r.values[h]))
  ];
  const dateFormat = detectDateFormat(dateValues);
  const schemaStyle = detectSchemaStyle(clientsParsed.header.length ? clientsParsed.header : contactsParsed.header);

  const { clients, issues: clientIssues } = profileClients(FILES.clients, clientsParsed, clientMap, dateFormat);
  const clientIds = new Set(clients.map(c => c.id).filter(Boolean));
  const { contacts, issues: contactIssues } = profileContacts(FILES.contacts, contactsParsed, contactMap, clientIds);

  const allHeaders = [clientsParsed, contactsParsed, coaParsed, txParsed].flatMap(p => p.header);
  const region = detectRegion({ headers: allHeaders, clients, contacts, dateFormat });
  const currency = detectCurrency(allHeaders, region);

  const issues = [
    ...(clientsParsed.missing ? [] : missingColumnIssues(FILES.clients, clientMap, ['id', 'name'])),
    ...clientsParsed.issues, ...clientIssues,
    ...(clientsParsed.missing || contactsParsed.missing ? [] : crossCheckIssues(FILES.clients, clientsParsed, clients, contacts)),
    ...(contactsParsed.missing ? [] : missingColumnIssues(FILES.contacts, contactMap, ['id', 'clientId'])),
    ...contactsParsed.issues, ...contactIssues,
    ...coaParsed.issues, ...txParsed.issues
  ];
  const fileOrder = Object.values(FILES);
  issues.sort((a, b) => fileOrder.indexOf(a.file) - fileOrder.indexOf(b.file) || a.row - b.row);

  return {
    id,
    label,
    suggestedCustomer: { name: label, industry: industryFromLabel(label), region, contactEmail: '' },
    schemaStyle,
    dateFormat,
    currency,
    counts: {
      clients: clients.length,
      contacts: contacts.length,
      chartOfAccounts: coaParsed.records.length,
      transactions: txParsed.records.length
    },
    clients,
    contacts,
    issues
  };
}

module.exports = { buildProfile, labelFromFolder, industryFromLabel, detectRegion, detectCurrency, FILES };
