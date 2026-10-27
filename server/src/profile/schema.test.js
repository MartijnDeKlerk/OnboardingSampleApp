const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { CLIENT_FIELDS, mapColumns, detectSchemaStyle, detectDateFormat, parseDate } = require('./schema');

describe('detectSchemaStyle', () => {
  it('recognises each customer header style', () => {
    assert.equal(detectSchemaStyle(['Client ID', 'Client Name', 'Status', 'Industry']), 'Title Case');
    assert.equal(detectSchemaStyle(['clientCode', 'companyName', 'entityType', 'mainContact']), 'camelCase');
    assert.equal(detectSchemaStyle(['customer_id', 'business_name', 'credit_terms']), 'snake_case');
  });
});

describe('mapColumns', () => {
  it('maps each schema style to canonical client fields', () => {
    assert.equal(mapColumns(['Client ID', 'Date Onboarded'], CLIENT_FIELDS).startDate, 'Date Onboarded');
    assert.equal(mapColumns(['clientCode', 'startDate'], CLIENT_FIELDS).id, 'clientCode');
    assert.equal(mapColumns(['customer_id', 'key_contact_name'], CLIENT_FIELDS).primaryContact, 'key_contact_name');
    assert.equal(mapColumns(['customer_id'], CLIENT_FIELDS).name, undefined);
  });
});

describe('dates', () => {
  it('detects each date format', () => {
    assert.equal(detectDateFormat(['01/15/2023', '12/01/2023']), 'MM/DD/YYYY');
    assert.equal(detectDateFormat(['2023-02-10', '2022-11-30']), 'YYYY-MM-DD');
    assert.equal(detectDateFormat(['15-03-2023', '28-01-2022', '']), 'DD-MM-YYYY');
  });

  it('parses each format to ISO', () => {
    assert.equal(parseDate('01/15/2024', 'MM/DD/YYYY'), '2024-01-15');
    assert.equal(parseDate('2024-01-15', 'YYYY-MM-DD'), '2024-01-15');
    assert.equal(parseDate('15-01-2024', 'DD-MM-YYYY'), '2024-01-15');
  });

  it('rejects impossible or mismatched dates', () => {
    assert.equal(parseDate('02/30/2024', 'MM/DD/YYYY'), null);
    assert.equal(parseDate('15/01/2024', 'MM/DD/YYYY'), null);
    assert.equal(parseDate('2024-01-15', 'DD-MM-YYYY'), null);
    assert.equal(parseDate('soon', 'YYYY-MM-DD'), null);
  });
});
