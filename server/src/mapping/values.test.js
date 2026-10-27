const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { parseCsv } = require('../profile/csv');
const { analyzeCsv } = require('./csv');
const { schemas } = require('./schemas');
const { PICKLISTS, suggestValue, isValidValueMapping, resolveValueMapping } = require('./values');
const sampleRoot = path.resolve(__dirname, '../../../sample-data');
const sample = (folder, name) => fs.readFileSync(path.join(sampleRoot, folder, name), 'utf8');
const samples = () => fs.readdirSync(sampleRoot, { withFileTypes: true }).filter(entry => entry.isDirectory()).flatMap(folder =>
  fs.readdirSync(path.join(sampleRoot, folder.name)).map(file => ({
    folder: folder.name, file, datasetType: file === 'chart_of_accounts.csv' ? 'accounts' : file.replace('.csv', '')
  })));
const readMapped = csv => {
  const [header, ...rows] = parseCsv(csv);
  return rows.map(row => Object.fromEntries(header.map((name, index) => [name, row[index]])));
};

// Every distinct picklist value in the 12 sample files and its expected target.
const EXPECTED = {
  'clients.entityType': {
    Corporation: 'Corporation', 'S-Corporation': 'S-Corporation', LLC: 'LLC', Partnership: 'Partnership',
    'Sole Proprietorship': 'Sole Proprietor', 'Non-Profit': 'Non-Profit',
    CORP: 'Corporation', SCORP: 'S-Corporation', PART: 'Partnership', SOLE: 'Sole Proprietor', NPROF: 'Non-Profit',
    'Limited Company': 'Corporation', LLP: 'LLC', 'Sole Trader': 'Sole Proprietor'
  },
  'clients.status': {
    Active: 'Active', Inactive: 'Inactive', Pending: 'Pending', A: 'Active', I: 'Inactive', P: 'Pending',
    ACTIVE: 'Active', DORMANT: 'Inactive', SUSPENDED: 'Pending'
  },
  'contacts.status': {
    Active: 'Active', Inactive: 'Inactive', Pending: 'Inactive', Y: 'Active', N: 'Inactive', P: 'Inactive',
    Dormant: 'Inactive', Suspended: 'Inactive'
  },
  'accounts.type': {
    Asset: 'Asset', Liability: 'Liability', Equity: 'Equity', Revenue: 'Revenue', Expense: 'Expense',
    ASSET: 'Asset', LIABILITY: 'Liability', EQUITY: 'Equity', REVENUE: 'Revenue', EXPENSE: 'Expense',
    Assets: 'Asset', Liabilities: 'Liability', Capital: 'Equity', Income: 'Revenue',
    'Direct Costs': 'Expense', Overheads: 'Expense', 'Finance Costs': 'Expense'
  },
  'accounts.normalBalance': { Debit: 'Debit', Credit: 'Credit', DR: 'Debit', CR: 'Credit', D: 'Debit', C: 'Credit' },
  'accounts.status': { Active: 'Active', 1: 'Active', Yes: 'Active' },
  'transactions.type': { Debit: 'Debit', Credit: 'Credit', DR: 'Debit', CR: 'Credit', D: 'Debit', C: 'Credit' },
  'transactions.status': {
    Cleared: 'Completed', Pending: 'Pending', Voided: 'Cancelled', POSTED: 'Completed', PENDING: 'Pending', VOID: 'Cancelled',
    Reconciled: 'Completed', Unreconciled: 'Pending', Cancelled: 'Cancelled'
  },
  'transactions.paymentMethod': {
    'Wire Transfer': 'Wire Transfer', WIRE: 'Wire Transfer', Wire: 'Wire Transfer',
    ACH: 'ACH', EFT: 'ACH', BACS: 'ACH', 'Direct Deposit': 'ACH', 'Direct Debit': 'ACH',
    Check: 'Check', CHECK: 'Check', Cheque: 'Check',
    'Credit Card': 'Credit Card', CARD: 'Credit Card', 'Card Payment': 'Credit Card', 'Online Payment': 'Credit Card',
    Cash: 'Cash', CASH: 'Cash', 'Petty Cash': 'Cash',
    'Bank Transfer': 'Bank Transfer', BANK: 'Bank Transfer', Bank: 'Bank Transfer', 'Bank Charge': 'Bank Transfer',
    FEE: 'Bank Transfer', 'Standing Order': 'Bank Transfer', Financing: 'Bank Transfer', LEASE: 'Bank Transfer',
    HP: 'Bank Transfer', 'Journal Entry': 'Bank Transfer', JE: 'Bank Transfer'
  }
};

describe('Value mapping', () => {
  it('marks exactly the picklist fields with their target values', () => {
    const marked = Object.values(schemas).flatMap(schema => schema.fields.filter(field => field.targets).map(field => `${schema.id}.${field.key}`));
    assert.deepEqual(marked.sort(), Object.keys(EXPECTED).sort());
    assert.deepEqual(schemas.transactions.fields.find(field => field.key === 'paymentMethod').targets, PICKLISTS.transactions.paymentMethod);
  });

  it('suggests a target for every distinct value in all 12 sample files', () => {
    const seen = Object.fromEntries(Object.keys(EXPECTED).map(key => [key, {}]));
    let files = 0;
    for (const { folder, file, datasetType } of samples()) {
      const result = analyzeCsv({ csv: sample(folder, file), datasetType });
      assert.deepEqual(result.errors, [], `${folder}/${file}`);
      assert.deepEqual(result.valueMappings.map(entry => entry.field), schemas[datasetType].fields.filter(field => field.targets).map(field => field.key));
      for (const entry of result.valueMappings) {
        for (const value of entry.values) {
          assert.notEqual(value.suggested, null, `${folder}/${file} ${entry.field}: ${value.source}`);
          assert.equal(value.target, value.suggested);
          seen[`${datasetType}.${entry.field}`][value.source] = value.suggested;
        }
      }
      files++;
    }
    assert.equal(files, 12);
    assert.deepEqual(seen, EXPECTED);
  });

  it('applies the user decisions for Premier entity and account types', () => {
    assert.equal(suggestValue('clients', 'entityType', 'Limited Company'), 'Corporation');
    assert.equal(suggestValue('clients', 'entityType', 'LLP'), 'LLC');
    assert.equal(suggestValue('accounts', 'type', 'Finance Costs'), 'Expense');
    assert.equal(suggestValue('accounts', 'type', 'Direct Costs'), 'Expense');
    assert.equal(suggestValue('accounts', 'type', 'Overheads'), 'Expense');
    assert.equal(suggestValue('accounts', 'status', '0'), 'Inactive');
    assert.equal(suggestValue('accounts', 'status', 'No'), 'Inactive');
  });

  it('matches case- and whitespace-insensitively and returns null for unknown or blank values', () => {
    assert.equal(suggestValue('transactions', 'paymentMethod', '  wire   transfer '), 'Wire Transfer');
    assert.equal(suggestValue('clients', 'status', 'dormant'), 'Inactive');
    assert.equal(suggestValue('transactions', 'paymentMethod', 'Bitcoin'), null);
    assert.equal(suggestValue('clients', 'status', ''), null);
    assert.equal(suggestValue('clients', 'name', 'Active'), null, 'non-picklist fields have no suggestions');
    assert.equal(suggestValue('clients', 'status', 'constructor'), null);
  });

  it('lists counts sorted by count then source, skips blank cells and exports target values', () => {
    const csv = 'id,name,status,entityType\n1,One,DORMANT,LTD\n2,Two,A,\n3,Three,DORMANT,LTD\n4,Four,ACTIVE,LLP\n';
    const result = analyzeCsv({ csv, datasetType: 'clients' });
    assert.deepEqual(result.errors, []);
    assert.deepEqual(result.valueMappings, [
      { field: 'entityType', label: 'Entity type', targets: PICKLISTS.clients.entityType, values: [
        { source: 'LTD', count: 2, suggested: 'Corporation', target: 'Corporation' },
        { source: 'LLP', count: 1, suggested: 'LLC', target: 'LLC' }
      ] },
      { field: 'status', label: 'Status', targets: PICKLISTS.clients.status, values: [
        { source: 'DORMANT', count: 2, suggested: 'Inactive', target: 'Inactive' },
        { source: 'A', count: 1, suggested: 'Active', target: 'Active' },
        { source: 'ACTIVE', count: 1, suggested: 'Active', target: 'Active' }
      ] }
    ]);
    assert.deepEqual(result.preview.map(row => [row.status, row.entityType]), [['Inactive', 'Corporation'], ['Active', ''], ['Inactive', 'Corporation'], ['Active', 'LLC']]);
    assert.deepEqual(readMapped(result.mappedCsv).map(row => row.status), ['Inactive', 'Active', 'Inactive', 'Active']);
    assert.ok(result.correctedCsv.includes('DORMANT'), 'the repaired source keeps original values');
  });

  it('omits picklist fields that are not column-mapped', () => {
    const result = analyzeCsv({ csv: 'id,name\n1,One\n', datasetType: 'clients' });
    assert.deepEqual(result.valueMappings, []);
  });

  it('lets overrides win over suggestions, matching source keys case-insensitively', () => {
    const csv = 'id,name,status\n1,One,DORMANT\n2,Two,A\n';
    const result = analyzeCsv({ csv, datasetType: 'clients', valueMapping: { status: { dormant: 'Pending', A: null }, unknownField: {} } });
    assert.deepEqual(result.errors, []);
    assert.deepEqual(result.valueMappings[0].values, [
      { source: 'A', count: 1, suggested: 'Active', target: 'Active' },
      { source: 'DORMANT', count: 1, suggested: 'Inactive', target: 'Pending' }
    ]);
    assert.deepEqual(readMapped(result.mappedCsv).map(row => row.status), ['Pending', 'Active']);
    assert.deepEqual(resolveValueMapping(result.valueMappings), { status: { A: 'Active', DORMANT: 'Pending' } });
  });

  it('blocks unknown values and invalid override targets until every value is mapped', () => {
    const csv = 'id,name,status\n1,One,Archived\n2,Two,A\n3,Three,Gone\n';
    const blocked = analyzeCsv({ csv, datasetType: 'clients', valueMapping: { status: { Gone: 'Removed' } } });
    assert.deepEqual(blocked.errors, [
      { line: null, message: 'Map every value for Status: "Archived"' },
      { line: null, message: 'Map every value for Status: "Gone"' }
    ]);
    assert.equal(blocked.mappedCsv, null);
    assert.equal(blocked.valueMappings[0].values.find(value => value.source === 'Archived').target, null);
    assert.equal(blocked.preview[0].status, 'Archived', 'unmapped values stay visible as their source value');
    assert.equal(blocked.preview[1].status, 'Active');
    const fixed = analyzeCsv({ csv, datasetType: 'clients', valueMapping: { status: { Archived: 'Inactive', Gone: 'Inactive' } } });
    assert.deepEqual(fixed.errors, []);
    assert.deepEqual(readMapped(fixed.mappedCsv).map(row => row.status), ['Inactive', 'Active', 'Inactive']);
  });

  it('rejects an invalid value mapping shape', () => {
    for (const valueMapping of ['status', [], { status: 'Active' }, { status: ['Active'] }, { status: { A: 1 } }]) {
      assert.equal(isValidValueMapping(valueMapping), false);
      const result = analyzeCsv({ csv: 'id,name,status\n1,One,A\n', datasetType: 'clients', valueMapping });
      assert.deepEqual(result.errors, [{ line: null, message: 'The value mapping must be an object.' }]);
      assert.deepEqual(result.valueMappings, []);
    }
    assert.equal(isValidValueMapping(undefined), true);
    assert.equal(isValidValueMapping(null), true);
  });
});
