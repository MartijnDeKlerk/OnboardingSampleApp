const { CLIENT_FIELDS, CONTACT_FIELDS, headerKey } = require('../profile/schema');
const { getTargets } = require('./values');

// Reuse existing client/contact aliases. Only the extra contact fields and the
// account/transaction aliases extend the shared profiling schema.
const definitions = {
  clients: ['Clients', [
    ['id', 'Client ID', true, 'text'],
    ['name', 'Company name', true, 'text'],
    ['entityType', 'Entity type', false, 'text'],
    ['status', 'Status', false, 'text'],
    ['startDate', 'Start date', false, 'date'],
    ['taxId', 'Tax ID', false, 'text'],
    ['annualRevenue', 'Annual revenue', false, 'number'],
    ['industry', 'Industry', false, 'text'],
    ['paymentTerms', 'Payment terms', false, 'text'],
    ['primaryContact', 'Primary contact', false, 'text']
  ]],
  contacts: ['Contacts', [
    ['id', 'Contact ID', true, 'text'],
    ['clientId', 'Client ID', true, 'text'],
    ['firstName', 'First name', true, 'text'],
    ['lastName', 'Last name', true, 'text'],
    ['email', 'Email', false, 'text'],
    ['phone', 'Phone', false, 'text'],
    ['role', 'Role', false, 'text'],
    ['status', 'Status', false, 'text'],
    ['preferredChannel', 'Preferred channel', false, 'text', 'Preferred Contact Method', 'communicationPreference', 'preferred_channel'],
    ['department', 'Department', false, 'text', 'Department', 'businessUnit', 'division']
  ]],
  accounts: ['Chart of accounts', [
    ['id', 'Account code', true, 'text', 'Account Number', 'acctCode', 'nominal_code'],
    ['name', 'Account name', true, 'text', 'Account Name', 'acctName', 'account_title'],
    ['type', 'Account type', true, 'text', 'Account Type', 'acctCategory', 'category'],
    ['subType', 'Account subtype', false, 'text', 'Sub Type', 'acctSubCategory', 'sub_category'],
    ['normalBalance', 'Normal balance', false, 'text', 'Normal Balance', 'balanceType', 'debit_credit'],
    ['status', 'Status', false, 'text', 'Status', 'activeFlag', 'is_active'],
    ['description', 'Description', false, 'text', 'Description', 'acctDescription', 'notes'],
    ['parentId', 'Parent account', false, 'text', 'Parent Account', 'parentAcctCode', 'parent_code']
  ]],
  transactions: ['Transactions', [
    ['id', 'Transaction ID', true, 'text', 'Transaction ID', 'txnId', 'transaction_ref'],
    ['date', 'Transaction date', true, 'date', 'Date', 'txnDate', 'posting_date'],
    ['clientId', 'Client ID', true, 'text', 'Client ID', 'clientCode', 'customer_id'],
    ['accountId', 'Account code', true, 'text', 'Account Number', 'acctCode', 'nominal_code'],
    ['description', 'Description', false, 'text', 'Description', 'memo', 'narrative'],
    ['type', 'Debit / credit', true, 'text', 'Transaction Type', 'entryType', 'dr_cr'],
    ['amount', 'Amount', true, 'number', 'Amount', 'txnAmount', 'amount_gbp'],
    ['reference', 'Document reference', false, 'text', 'Reference Number', 'docNumber', 'document_ref'],
    ['paymentMethod', 'Payment method', false, 'text', 'Payment Method', 'paymentType', 'settlement_method'],
    ['status', 'Status', false, 'text', 'Status', 'txnStatus', 'posting_status'],
    ['category', 'Category', false, 'text', 'Category', 'expenseCategory', 'cost_centre']
  ]]
};

const schemas = Object.fromEntries(Object.entries(definitions).map(([id, [label, fields]]) => [id, {
  id, label,
  fields: fields.map(([key, label, required, type, ...aliases]) => ({
    key, label, required, type,
    aliases: (id === 'clients' ? CLIENT_FIELDS[key] : id === 'contacts' ? CONTACT_FIELDS[key] : null) || aliases,
    // Picklist fields carry their canonical target values (see values.js).
    ...(getTargets(id, key) && { targets: getTargets(id, key) })
  }))
}]));
const normalizeHeader = headerKey;

function detectSource(headers, schema) {
  return [0, 1, 2].find(source => headers.length === schema.fields.length &&
    schema.fields.every(field => headers.some(header => normalizeHeader(header) === normalizeHeader(field.aliases[source]))));
}

module.exports = { schemas, normalizeHeader, detectSource };
