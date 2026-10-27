const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { parseCsv, toRecords, stringifyCsv } = require('./csv');

describe('parseCsv', () => {
  it('splits simple rows and skips blank lines', () => {
    assert.deepEqual(parseCsv('a,b,c\n1,2,3\n\n4,5,6\n'), [['a', 'b', 'c'], ['1', '2', '3'], ['4', '5', '6']]);
  });

  it('handles CRLF line endings and a byte-order mark', () => {
    assert.deepEqual(parseCsv('﻿a,b\r\n1,2\r\n'), [['a', 'b'], ['1', '2']]);
  });

  it('keeps commas, escaped quotes and newlines inside quoted fields', () => {
    assert.deepEqual(parseCsv('name,note\n"Williams, Robert","said ""hi""\nthen left"\n'), [
      ['name', 'note'], ['Williams, Robert', 'said "hi"\nthen left']
    ]);
  });

  it('keeps empty trailing fields', () => {
    assert.deepEqual(parseCsv('a,b,c\n1,,\n'), [['a', 'b', 'c'], ['1', '', '']]);
  });
});

describe('toRecords', () => {
  it('keys values by trimmed header with 1-based data row numbers', () => {
    const { header, records, issues } = toRecords(parseCsv(' id ,name\n1, Acme \n2,Beta\n'), { file: 'x.csv' });
    assert.deepEqual(header, ['id', 'name']);
    assert.deepEqual(records, [{ row: 1, values: { id: '1', name: 'Acme' } }, { row: 2, values: { id: '2', name: 'Beta' } }]);
    assert.deepEqual(issues, []);
  });

  it('merges overflow from an unquoted comma into the last column and warns', () => {
    const csv = 'clientCode,billingTerms,mainContact\nXYZ-001,NET30,Williams, Robert\nXYZ-002,NET15,"Thompson, Karen"\n';
    const fieldFor = h => (h === 'mainContact' ? 'primaryContact' : h);
    const { records, issues } = toRecords(parseCsv(csv), { file: 'clients.csv', fieldFor, mergeInto: 'mainContact' });
    assert.equal(records[0].values.mainContact, 'Williams, Robert');
    assert.equal(records[0].values.billingTerms, 'NET30');
    assert.equal(records[0].malformed, undefined);
    assert.equal(records[1].values.mainContact, 'Thompson, Karen');
    assert.equal(issues.length, 1);
    const { message, ...rest } = issues[0];
    assert.deepEqual(rest, { file: 'clients.csv', row: 1, field: 'primaryContact', severity: 'warning' });
    assert.match(message, /unquoted comma/);
  });

  it('parses the quoted version of the same row without any issue', () => {
    const csv = 'clientCode,billingTerms,mainContact\nXYZ-001,NET30,"Williams, Robert"\n';
    const { records, issues } = toRecords(parseCsv(csv), { file: 'clients.csv', mergeInto: 'mainContact' });
    assert.deepEqual(records[0].values, { clientCode: 'XYZ-001', billingTerms: 'NET30', mainContact: 'Williams, Robert' });
    assert.deepEqual(issues, []);
  });

  it('reports overflow in a middle column as an error without shifting values', () => {
    const csv = [
      'Account Number,Account Name,Status,Description,Parent Account',
      '6200,Rent,Active,Office rent,6000',
      '6300,Utilities,Active,Electric, gas, water,6000'
    ].join('\n');
    const { records, issues } = toRecords(parseCsv(csv), { file: 'chart_of_accounts.csv' });
    assert.equal(records.length, 2);
    assert.equal(records[0].malformed, undefined);
    assert.equal(records[1].malformed, true);
    assert.deepEqual(records[1].values, { 'Account Number': '6300', 'Account Name': '', Status: '', Description: '', 'Parent Account': '' });
    assert.equal(issues.length, 1);
    assert.equal(issues[0].severity, 'error');
    assert.equal(issues[0].row, 2);
    assert.match(issues[0].message, /not imported/);
  });

  it('does not merge into the last column unless the caller allows it', () => {
    const csv = 'id,name,contact\n1,Acme,Williams, Robert\n';
    assert.equal(toRecords(parseCsv(csv), { file: 'x.csv' }).issues[0].severity, 'error');
    assert.equal(toRecords(parseCsv(csv), { file: 'x.csv', mergeInto: 'name' }).issues[0].severity, 'error');
    const rejected = toRecords(parseCsv(csv), { file: 'x.csv', mergeInto: 'contact', acceptMerge: () => false });
    assert.equal(rejected.issues[0].severity, 'error');
    assert.equal(rejected.records[0].values.contact, '');
  });

  it('pads short rows and warns', () => {
    const { records, issues } = toRecords(parseCsv('a,b,c\n1,2\n'), { file: 'x.csv' });
    assert.deepEqual(records[0].values, { a: '1', b: '2', c: '' });
    assert.equal(issues[0].field, 'c');
    assert.equal(issues[0].severity, 'warning');
  });
});

describe('strict import parsing and export', () => {
  it('rejects malformed quoting when strict mode is requested', () => {
    for (const text of ['id,name\n1,"unclosed', 'id,name\n1,un"quoted', 'id,name\n1,"closed"extra']) {
      assert.throws(() => parseCsv(text, { strict: true }));
    }
  });

  it('reports physical lines and raw records without changing the default interface', () => {
    const text = 'id,name\r\n\r\n1,"First\nSecond"\r\n2,Other';
    const records = parseCsv(text, { strict: true, info: true });
    assert.equal(records[1].info.lines, 4);
    assert.equal(records[1].raw, '1,"First\nSecond"\r\n');
    assert.deepEqual(records.map(entry => entry.record), parseCsv(text));
  });

  it('escapes commas, quotes and newlines when exporting CSV', () => {
    const rows = [['id', 'text'], ['001', 'A, "quoted" value'], ['002', 'First\nSecond']];
    assert.equal(stringifyCsv(rows), 'id,text\n001,"A, ""quoted"" value"\n002,"First\nSecond"\n');
    assert.deepEqual(parseCsv(stringifyCsv(rows), { strict: true }), rows);
  });
});
