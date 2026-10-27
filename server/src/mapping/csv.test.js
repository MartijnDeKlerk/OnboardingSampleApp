const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const os = require('node:os');
const { parseCsv } = require('../profile/csv');
const { repairCsv, analyzeCsv, normalizeDate, MAX_BYTES } = require('./csv');
const sampleRoot = path.resolve(__dirname, '../../../sample-data');
const sample = (folder, name) => fs.readFileSync(path.join(sampleRoot, folder, name), 'utf8');
const unquoteContacts = csv => csv.replace(/"([^"\r\n]+,[^"\r\n]+)"(?=\r?$)/gm, '$1');
const readMapped = csv => {
  const [header, ...rows] = parseCsv(csv);
  return rows.map(row => Object.fromEntries(header.map((name, index) => [name, row[index]])));
};

describe('CSV preparation', () => {
  it('processes all 12 already-fixed sample files and preserves all 279 records without unnecessary repairs', () => {
    let files = 0, rows = 0, repairs = 0;
    for (const folder of fs.readdirSync(sampleRoot, { withFileTypes: true }).filter(entry => entry.isDirectory())) {
      for (const file of fs.readdirSync(path.join(sampleRoot, folder.name))) {
        const datasetType = file === 'chart_of_accounts.csv' ? 'accounts' : file.replace('.csv', '');
        const result = analyzeCsv({ csv: sample(folder.name, file), datasetType });
        assert.deepEqual(result.errors, [], `${folder.name}/${file}`);
        assert.equal(readMapped(result.mappedCsv).length, result.totalRows);
        assert.equal(parseCsv(result.correctedCsv).length - 1, result.totalRows);
        assert.equal(repairCsv(result.correctedCsv).repairs.length, 0, 'repairs must be idempotent');
        files++;
        rows += result.totalRows;
        repairs += result.repairs.length;
      }
    }
    assert.equal(files, 12);
    assert.equal(rows, 279);
    assert.equal(repairs, 0);
  });

  it('repairs known split names and the account description without dropping content', () => {
    const xyz = analyzeCsv({ csv: unquoteContacts(sample('CustomerB_XYZFinancialServices', 'clients.csv')), datasetType: 'clients' });
    assert.equal(xyz.repairs.length, 12);
    assert.equal(xyz.repairs[0].line, 2);
    assert.equal(xyz.preview[0].primaryContact, 'Williams, Robert');
    assert.ok(xyz.correctedCsv.includes('"Williams, Robert"'));
    const abc = analyzeCsv({ csv: sample('CustomerA_ABCAccounting', 'chart_of_accounts.csv').replace('"Electric, gas, water"', 'Electric, gas, water'), datasetType: 'accounts' });
    assert.equal(abc.repairs[0].line, 33);
    const utilities = readMapped(abc.mappedCsv).find(row => row.id === '6300');
    assert.equal(utilities.description, 'Electric, gas, water');
    assert.equal(utilities.parentId, '6000');
  });

  it('supports BOM, CRLF, quoted commas, escaped quotes, Unicode and multiline cells', () => {
    const original = [['id', 'name'], ['001', 'Firma Łódź, "A"'], ['002', 'First\nSecond']];
    const result = repairCsv('\uFEFFid,name\r\n001,"Firma Łódź, ""A"""\r\n002,"First\nSecond"\r\n');
    assert.deepEqual(result.errors, []);
    assert.deepEqual(parseCsv(result.correctedCsv), original);
    assert.equal(result.repairs.length, 0);
  });

  it('blocks unknown excess columns and missing cells rather than dropping or inventing data', () => {
    for (const csv of ['id,name\n1,Hello,extra\n2,Good\n', 'id,name\n1\n2,Good\n']) {
      const result = repairCsv(csv);
      assert.equal(result.errors.length, 1);
      assert.equal(result.errors[0].line, 2);
      assert.equal(result.correctedCsv, null);
      assert.equal(result.totalRows, 2);
    }
  });

  it('rejects malformed quoting, duplicate headers, empty data and size limits', () => {
    for (const csv of ['id,name\n1,"Unclosed', 'id,ID\n1,2\n', 'id,name\n', '', 'x'.repeat(MAX_BYTES + 1)]) {
      assert.ok(repairCsv(csv).errors.length);
      assert.equal(repairCsv(csv).correctedCsv, null);
    }
    assert.ok(repairCsv('id,name\n' + '1,Name\n'.repeat(5001)).errors.length);
  });

  it('allows manual mapping, reports excluded columns, and preserves precise amounts and leading zeros', () => {
    const result = analyzeCsv({
      csv: 'Code,Company,Revenue,Extra\n001,Example,12345678901234567890.12,Keep me in source\n',
      datasetType: 'clients', mapping: { id: 'Code', name: 'Company', annualRevenue: 'Revenue' }
    });
    assert.deepEqual(result.errors, []);
    assert.equal(result.preview[0].id, '001');
    assert.equal(result.preview[0].annualRevenue, '12345678901234567890.12');
    assert.deepEqual(result.unmappedHeaders, ['Extra']);
    assert.ok(result.correctedCsv.includes('Keep me in source'));
    const accounts = analyzeCsv({ csv: sample('CustomerC_PremierBookkeeping', 'chart_of_accounts.csv'), datasetType: 'accounts' });
    assert.equal(accounts.preview[0].id, '0010');
  });

  it('normalizes dates using known schemas and rejects impossible dates and duplicate IDs', () => {
    assert.equal(normalizeDate('29-02-2024', 'DMY'), '2024-02-29');
    assert.equal(normalizeDate('02/29/2023', 'MDY'), null);
    assert.equal(normalizeDate('2024-13-01', 'YMD'), null);
    const result = analyzeCsv({ datasetType: 'clients', csv: 'id,name,startDate\n1,First,2024-02-30\n1,Second,2024-01-01\n' });
    assert.ok(result.errors.some(error => error.message.includes('Invalid start date')));
    assert.ok(result.errors.some(error => error.message.includes('Duplicate ID')));
    assert.equal(result.mappedCsv, null);
    const ambiguous = analyzeCsv({ datasetType: 'clients', csv: 'id,name,startDate\n1,First,01/02/2024\n' });
    assert.ok(ambiguous.errors.length, 'custom dates must not be guessed');
    const selected = analyzeCsv({ datasetType: 'clients', csv: 'id,name,startDate\n1,First,01/02/2024\n', dateFormat: 'DMY' });
    assert.equal(selected.preview[0].startDate, '2024-02-01');
  });

  it('validates dataset types, required mapping, duplicate assignments and missing source columns', () => {
    for (const datasetType of ['unknown', '__proto__', 'constructor', {}]) {
      assert.ok(analyzeCsv({ csv: 'id,name\n1,Example\n', datasetType }).errors.length);
    }
    assert.ok(analyzeCsv({ datasetType: 'clients', csv: 'code,label\n1,Example\n' }).errors.length);
    assert.ok(analyzeCsv({ datasetType: 'clients', csv: 'id,name\n1,Example\n', mapping: { id: 'id', name: 'id' } }).errors.length);
    assert.ok(analyzeCsv({ datasetType: 'clients', csv: 'id,name\n1,Example\n', mapping: { id: 'id', name: 'missing' } }).errors.length);
  });

  it('provides a CLI that requires repair acceptance, preserves input and refuses overwrite', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'onboarding-csv-'));
    const output = path.join(dir, 'fixed.csv');
    const input = path.join(dir, 'legacy.csv');
    const original = unquoteContacts(sample('CustomerB_XYZFinancialServices', 'clients.csv'));
    fs.writeFileSync(input, original);
    const script = path.resolve(__dirname, '../../../scripts/repair-csv.js');
    try {
      const review = spawnSync(process.execPath, [script, input, output], { encoding: 'utf8' });
      assert.equal(review.status, 2);
      assert.equal(fs.existsSync(output), false);
      const accepted = spawnSync(process.execPath, [script, input, output, '--accept-repairs'], { encoding: 'utf8' });
      assert.equal(accepted.status, 0, accepted.stderr);
      assert.equal(parseCsv(fs.readFileSync(output, 'utf8')).length, 13);
      assert.equal(fs.readFileSync(input, 'utf8'), original);
      assert.equal(spawnSync(process.execPath, [script, input, output, '--accept-repairs']).status, 1);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
});
