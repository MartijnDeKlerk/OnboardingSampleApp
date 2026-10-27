const { parseCsv } = require('../profile/csv');
const { schemas } = require('../mapping/schemas');

// Records are loaded parents first, so references always point at loaded data.
const IMPORT_ORDER = ['accounts', 'clients', 'contacts', 'transactions'];

// Cross-file references checked before import. A blank value is only allowed
// where the field is optional in the schema (top-level accounts have no parent).
const REFERENCES = [
  { datasetType: 'contacts', field: 'clientId', target: 'clients' },
  { datasetType: 'transactions', field: 'clientId', target: 'clients' },
  { datasetType: 'transactions', field: 'accountId', target: 'accounts' },
  { datasetType: 'accounts', field: 'parentId', target: 'accounts' }
];

const SINGULAR = { clients: 'client', accounts: 'account' };
const NUMBER = /^-?\d+(\.\d+)?$/;

// Turns a saved mapping's mapped CSV (header row = target field keys) into
// records keyed by field. Every schema field is present, blank when missing.
function parseMappedCsv(mappedCsv, datasetType) {
  const [header = [], ...rows] = parseCsv(mappedCsv || '');
  const keys = header.map(key => key.trim());
  return rows.map(values => Object.fromEntries(schemas[datasetType].fields.map(field => {
    const index = keys.indexOf(field.key);
    return [field.key, index === -1 ? '' : String(values[index] ?? '').trim()];
  })));
}

const label = datasetType => schemas[datasetType].label.toLowerCase();

// Validates the four mapped data sets together. `mappings` is the list from
// store.getCustomerMappings. Rows are 1-based data rows of the mapped CSV.
function checkImport(mappings) {
  const records = Object.fromEntries(IMPORT_ORDER.map(type => {
    const saved = mappings.find(mapping => mapping.datasetType === type);
    return [type, saved ? parseMappedCsv(saved.mappedCsv, type) : []];
  }));
  const issues = [];
  const add = (datasetType, index, field, severity, message) => issues.push({
    datasetType, row: index + 1, recordId: records[datasetType][index]?.id || '', field, severity, message
  });

  for (const type of IMPORT_ORDER) {
    const seen = new Map();
    records[type].forEach((record, index) => {
      for (const field of schemas[type].fields) {
        const value = record[field.key];
        if (field.required && !value) add(type, index, field.key, 'error', `${field.label} is required.`);
        else if (value && field.type === 'number' && !NUMBER.test(value)) {
          add(type, index, field.key, 'error', `${field.label} must be a number, found "${value}".`);
        }
      }
      if (!record.id) return;
      if (seen.has(record.id)) {
        add(type, index, 'id', 'error', `Duplicate ${schemas[type].fields[0].label.toLowerCase()} ${record.id} (first seen in row ${seen.get(record.id)}).`);
      } else seen.set(record.id, index + 1);
    });
  }

  const byId = Object.fromEntries(IMPORT_ORDER.map(type => [type, new Map(records[type].map(record => [record.id, record]))]));
  for (const { datasetType, field, target } of REFERENCES) {
    records[datasetType].forEach((record, index) => {
      const value = record[field];
      if (!value) return; // A missing required value is already reported above.
      if (!byId[target].has(value)) {
        add(datasetType, index, field, 'error', `References ${SINGULAR[target]} ${value}, which is not in the mapped ${label(target)}.`);
      } else if (field === 'parentId' && value === record.id) {
        add(datasetType, index, field, 'error', `Account ${value} cannot be its own parent.`);
      }
    });
  }

  // Not blocking: postings to inactive accounts are allowed but worth a look.
  records.transactions.forEach((record, index) => {
    if (byId.accounts.get(record.accountId)?.status === 'Inactive') {
      add('transactions', index, 'accountId', 'warning', `Posted to account ${record.accountId}, which is Inactive.`);
    }
  });

  const counts = Object.fromEntries(['accounts', 'clients', 'contacts', 'transactions'].map(type => [type, records[type].length]));
  return { ready: !issues.some(issue => issue.severity === 'error'), counts, issues, records };
}

module.exports = { checkImport, parseMappedCsv, IMPORT_ORDER, REFERENCES };
