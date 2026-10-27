// Value (picklist) mapping for Data Mapping. Target picklists are the
// canonical platform values; suggestions follow sample-data/README.md plus the
// workshop decisions noted inline. Unknown values are suggested as null and
// must be mapped by the user before the file can be saved.
const { normaliseEntityType, normaliseClientStatus, normaliseContactStatus } = require('../profile/normalise');

const PICKLISTS = {
  clients: {
    entityType: ['Corporation', 'S-Corporation', 'LLC', 'Partnership', 'Sole Proprietor', 'Non-Profit'],
    status: ['Active', 'Inactive', 'Pending']
  },
  contacts: { status: ['Active', 'Inactive'] },
  accounts: {
    type: ['Asset', 'Liability', 'Equity', 'Revenue', 'Expense'],
    normalBalance: ['Debit', 'Credit'],
    status: ['Active', 'Inactive']
  },
  transactions: {
    type: ['Debit', 'Credit'],
    status: ['Completed', 'Pending', 'Cancelled'],
    paymentMethod: ['Wire Transfer', 'ACH', 'Check', 'Credit Card', 'Cash', 'Bank Transfer']
  }
};

// Case- and whitespace-insensitive comparison key.
const valueKey = value => String(value ?? '').trim().toLowerCase().replace(/[\s_]+/g, ' ');
const table = entries => Object.fromEntries(Object.entries(entries).flatMap(([target, sources]) => sources.map(source => [valueKey(source), target])));
const lookup = map => value => Object.hasOwn(map, valueKey(value)) ? map[valueKey(value)] : null;

const debitCredit = lookup(table({ Debit: ['Debit', 'DR', 'D'], Credit: ['Credit', 'CR', 'C'] }));

// Account status flags: 1/Yes -> Active, 0/No -> Inactive.
const accountStatus = lookup(table({
  Active: ['Active', '1', 'Yes', 'Y', 'True'],
  Inactive: ['Inactive', '0', 'No', 'N', 'False']
}));

// "Finance Costs" (Premier) is not in the README tables; it is mapped to
// Expense by user decision, like "Direct Costs" and "Overheads".
const accountType = lookup(table({
  Asset: ['Asset', 'Assets'],
  Liability: ['Liability', 'Liabilities'],
  Equity: ['Equity', 'Capital'],
  Revenue: ['Revenue', 'Income'],
  Expense: ['Expense', 'Expenses', 'Direct Costs', 'Overheads', 'Finance Costs']
}));

const transactionStatus = lookup(table({
  Completed: ['Completed', 'Cleared', 'Posted', 'Reconciled'],
  Pending: ['Pending', 'Unreconciled'],
  Cancelled: ['Cancelled', 'Canceled', 'Voided', 'Void']
}));

// README table plus the extra values found in the sample transactions.
// Electronic bank debits (EFT, BACS, Direct Debit, Direct Deposit) map to ACH;
// bank-initiated and financed payments (bank fees, interest, standing orders,
// lease/hire purchase/financing, journal entries) map to Bank Transfer.
const paymentMethod = lookup(table({
  'Wire Transfer': ['Wire Transfer', 'Wire'],
  ACH: ['ACH', 'EFT', 'BACS', 'Direct Deposit', 'Direct Debit'],
  Check: ['Check', 'Cheque'],
  'Credit Card': ['Credit Card', 'Card', 'Card Payment', 'Online Payment'],
  Cash: ['Cash', 'Petty Cash'],
  'Bank Transfer': ['Bank Transfer', 'Bank', 'Bank Charge', 'Fee', 'Standing Order', 'Financing', 'Lease', 'HP', 'Hire Purchase', 'Journal Entry', 'JE']
}));

// Reuse the profiling lookup tables for clients/contacts ("Limited Company" ->
// Corporation and LLP -> LLC come from there).
const SUGGESTERS = {
  clients: { entityType: normaliseEntityType, status: normaliseClientStatus },
  contacts: { status: normaliseContactStatus },
  accounts: { type: accountType, normalBalance: debitCredit, status: accountStatus },
  transactions: { type: debitCredit, status: transactionStatus, paymentMethod }
};

const getTargets = (datasetType, fieldKey) => PICKLISTS[datasetType]?.[fieldKey] || null;

function suggestValue(datasetType, fieldKey, value) {
  const targets = getTargets(datasetType, fieldKey);
  if (!targets || !valueKey(value)) return null;
  const canonical = targets.find(target => valueKey(target) === valueKey(value));
  if (canonical) return canonical;
  const suggested = SUGGESTERS[datasetType][fieldKey](value);
  return targets.includes(suggested) ? suggested : null;
}

const isPlainObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);

// Overrides: { [fieldKey]: { [sourceValue]: targetValue } }. A null target
// means "no override" and falls back to the suggestion.
function isValidValueMapping(overrides) {
  if (overrides == null) return true;
  return isPlainObject(overrides) && Object.values(overrides).every(entries =>
    isPlainObject(entries) && Object.values(entries).every(target => target === null || typeof target === 'string'));
}

function findOverride(entries, source) {
  if (!isPlainObject(entries)) return undefined;
  if (Object.hasOwn(entries, source)) return entries[source];
  const match = Object.keys(entries).find(key => valueKey(key) === valueKey(source));
  return match === undefined ? undefined : entries[match];
}

// Builds one entry per mapped picklist field (schema order) from the mapped
// rows. Blank cells are not listed. Returns the entries and blocking errors.
function buildValueMappings(schema, columnMapping, rows, overrides) {
  const valueMappings = [];
  const errors = [];
  for (const field of schema.fields) {
    if (!field.targets || !columnMapping[field.key]) continue;
    const counts = new Map();
    for (const row of rows) {
      const source = row[field.key];
      if (source) counts.set(source, (counts.get(source) || 0) + 1);
    }
    const entries = Object.hasOwn(overrides || {}, field.key) ? overrides[field.key] : undefined;
    const values = [...counts].map(([source, count]) => {
      const suggested = suggestValue(schema.id, field.key, source);
      const override = findOverride(entries, source);
      return { source, count, suggested, target: override ?? suggested };
    }).sort((a, b) => b.count - a.count || (a.source < b.source ? -1 : a.source > b.source ? 1 : 0));
    for (const value of values) {
      if (!field.targets.includes(value.target)) errors.push({ line: null, message: `Map every value for ${field.label}: "${value.source}"` });
    }
    valueMappings.push({ field: field.key, label: field.label, targets: field.targets, values });
  }
  return { valueMappings, errors };
}

// Fully resolved map { [field]: { [source]: target } } for saving.
function resolveValueMapping(valueMappings) {
  return Object.fromEntries(valueMappings.map(entry => [entry.field, Object.fromEntries(entry.values.map(value => [value.source, value.target]))]));
}

module.exports = { PICKLISTS, getTargets, suggestValue, isValidValueMapping, buildValueMappings, resolveValueMapping, valueKey };
