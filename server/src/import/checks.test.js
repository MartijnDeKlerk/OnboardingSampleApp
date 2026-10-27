const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { checkImport, parseMappedCsv } = require('./checks');
const { schemas } = require('../mapping/schemas');
const { stringifyCsv } = require('../profile/csv');

// Builds a saved mapping whose mapped CSV has the schema's field keys as header.
function mapping(datasetType, rows) {
  const keys = schemas[datasetType].fields.map(field => field.key);
  return { datasetType, mappedCsv: stringifyCsv([keys, ...rows.map(row => keys.map(key => row[key] ?? ''))]) };
}

function validSet(overrides = {}) {
  return [
    mapping('accounts', overrides.accounts || [
      { id: '1000', name: 'Assets', type: 'Asset', status: 'Active' },
      { id: '1010', name: 'Cash', type: 'Asset', status: 'Active', parentId: '1000' },
      { id: '6000', name: 'Old expenses', type: 'Expense', status: 'Active' }
    ]),
    mapping('clients', overrides.clients || [{ id: 'C001', name: 'Alpha' }, { id: 'C002', name: 'Beta', annualRevenue: '1200.50' }]),
    mapping('contacts', overrides.contacts || [{ id: 'P1', clientId: 'C001', firstName: 'Ann', lastName: 'Lee' }]),
    mapping('transactions', overrides.transactions || [
      { id: 'T1', date: '2024-01-02', clientId: 'C001', accountId: '1010', type: 'Debit', amount: '100.00' },
      { id: 'T2', date: '2024-01-03', clientId: 'C002', accountId: '1010', type: 'Credit', amount: '-5' }
    ])
  ];
}

const errorsOf = result => result.issues.filter(issue => issue.severity === 'error');

describe('import dry-run checks', () => {
  it('passes a consistent data set and counts records per type', () => {
    const result = checkImport(validSet());
    assert.equal(result.ready, true);
    assert.deepEqual(result.issues, []);
    assert.deepEqual(result.counts, { accounts: 3, clients: 2, contacts: 1, transactions: 2 });
  });

  it('keeps leading zeros and decimal strings when parsing the mapped CSV', () => {
    const [record] = parseMappedCsv('id,name,annualRevenue\n007,Bond,10.10\n', 'clients');
    assert.equal(record.id, '007');
    assert.equal(record.annualRevenue, '10.10');
    assert.equal(record.status, '', 'fields missing from the CSV are blank');
  });

  it('reports duplicate IDs per data type with the row of the first occurrence', () => {
    const result = checkImport(validSet({ clients: [{ id: 'C001', name: 'Alpha' }, { id: 'C002', name: 'Beta' }, { id: 'C001', name: 'Again' }] }));
    assert.equal(result.ready, false);
    assert.deepEqual(errorsOf(result), [{
      datasetType: 'clients', row: 3, recordId: 'C001', field: 'id', severity: 'error', message: 'Duplicate client id C001 (first seen in row 1).'
    }]);
  });

  it('allows the same ID in different data types', () => {
    const result = checkImport(validSet({ clients: [{ id: '1000', name: 'Alpha' }, { id: 'C001', name: 'A' }, { id: 'C002', name: 'B' }] }));
    assert.equal(result.ready, true);
  });

  it('requires contacts to reference a mapped client', () => {
    const result = checkImport(validSet({ contacts: [{ id: 'P1', clientId: 'C999', firstName: 'Ann', lastName: 'Lee' }] }));
    assert.deepEqual(errorsOf(result).map(({ datasetType, row, field }) => ({ datasetType, row, field })), [{ datasetType: 'contacts', row: 1, field: 'clientId' }]);
    assert.match(errorsOf(result)[0].message, /References client C999, which is not in the mapped clients\./);
  });

  it('requires transactions to reference a mapped client and account', () => {
    const result = checkImport(validSet({ transactions: [
      { id: 'T1', date: '2024-01-02', clientId: 'C404', accountId: '1010', type: 'Debit', amount: '1' },
      { id: 'T2', date: '2024-01-02', clientId: 'C001', accountId: '9999', type: 'Debit', amount: '1' }
    ] }));
    assert.deepEqual(errorsOf(result).map(({ row, field }) => [row, field]), [[1, 'clientId'], [2, 'accountId']]);
  });

  it('requires a parent account to exist but allows a blank parent', () => {
    const result = checkImport(validSet({ accounts: [
      { id: '1000', name: 'Assets', type: 'Asset' },
      { id: '1010', name: 'Cash', type: 'Asset', parentId: '1999' },
      { id: '1020', name: 'Loop', type: 'Asset', parentId: '1020' }
    ], transactions: [] }));
    assert.deepEqual(errorsOf(result).map(({ row, field, message }) => [row, field, message]), [
      [2, 'parentId', 'References account 1999, which is not in the mapped chart of accounts.'],
      [3, 'parentId', 'Account 1020 cannot be its own parent.']
    ]);
  });

  it('reports missing required fields', () => {
    const result = checkImport(validSet({ contacts: [{ id: 'P1', clientId: 'C001', firstName: 'Ann' }] }));
    assert.deepEqual(errorsOf(result).map(({ field, message }) => [field, message]), [['lastName', 'Last name is required.']]);
  });

  it('requires numeric amounts', () => {
    const result = checkImport(validSet({ transactions: [
      { id: 'T1', date: '2024-01-02', clientId: 'C001', accountId: '1010', type: 'Debit', amount: '1,000.00' }
    ], clients: [{ id: 'C001', name: 'Alpha', annualRevenue: 'lots' }] }));
    assert.deepEqual(errorsOf(result).map(({ datasetType, field }) => [datasetType, field]), [['clients', 'annualRevenue'], ['transactions', 'amount']]);
  });

  it('warns without blocking when a transaction posts to an inactive account', () => {
    const accounts = [{ id: '1010', name: 'Cash', type: 'Asset', status: 'Inactive' }];
    const result = checkImport(validSet({ accounts }));
    assert.equal(result.ready, true);
    assert.deepEqual(result.issues.map(issue => issue.severity), ['warning', 'warning']);
  });
});
