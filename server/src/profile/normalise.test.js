const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const n = require('./normalise');

describe('picklist normalisation', () => {
  it('maps entity types from all three customers', () => {
    const cases = {
      Corporation: 'Corporation', CORP: 'Corporation', 'Limited Company': 'Corporation',
      'S-Corporation': 'S-Corporation', SCORP: 'S-Corporation',
      LLC: 'LLC', LLP: 'LLC',
      Partnership: 'Partnership', PART: 'Partnership',
      'Sole Proprietorship': 'Sole Proprietor', SOLE: 'Sole Proprietor', 'Sole Trader': 'Sole Proprietor',
      'Non-Profit': 'Non-Profit', NPROF: 'Non-Profit'
    };
    for (const [raw, canonical] of Object.entries(cases)) assert.equal(n.normaliseEntityType(raw), canonical, raw);
    assert.equal(n.normaliseEntityType('Trust'), null);
  });

  it('maps client statuses from all three customers', () => {
    const cases = {
      Active: 'Active', A: 'Active', ACTIVE: 'Active',
      Inactive: 'Inactive', I: 'Inactive', DORMANT: 'Inactive',
      Pending: 'Pending', P: 'Pending', SUSPENDED: 'Pending'
    };
    for (const [raw, canonical] of Object.entries(cases)) assert.equal(n.normaliseClientStatus(raw), canonical, raw);
    assert.equal(n.normaliseClientStatus('Closed'), null);
  });

  it('maps contact statuses to Active or Inactive', () => {
    const cases = {
      Active: 'Active', Y: 'Active', Inactive: 'Inactive', N: 'Inactive',
      Pending: 'Inactive', P: 'Inactive', Dormant: 'Inactive', Suspended: 'Inactive'
    };
    for (const [raw, canonical] of Object.entries(cases)) assert.equal(n.normaliseContactStatus(raw), canonical, raw);
    assert.equal(n.normaliseContactStatus('maybe'), null);
  });
});

describe('value normalisation', () => {
  it('expands sector codes and keeps industry names', () => {
    assert.equal(n.normaliseIndustry('TECH'), 'Technology');
    assert.equal(n.normaliseIndustry('Food & Beverage'), 'Food & Beverage');
  });

  it('normalises payment terms', () => {
    assert.equal(n.normalisePaymentTerms('NET30'), 'Net 30');
    assert.equal(n.normalisePaymentTerms('30 Days'), 'Net 30');
    assert.equal(n.normalisePaymentTerms('Net 45'), 'Net 45');
    assert.equal(n.normalisePaymentTerms('COD'), 'Due on Receipt');
    assert.equal(n.normalisePaymentTerms('Immediate'), 'Due on Receipt');
  });

  it('turns "Last, First" into "First Last"', () => {
    assert.equal(n.normalisePersonName('Williams, Robert'), 'Robert Williams');
    assert.equal(n.normalisePersonName(' John  Smith '), 'John Smith');
  });

  it('parses amounts', () => {
    assert.equal(n.parseAmount('2500000.00'), 2500000);
    assert.equal(n.parseAmount('£1,250,000'), 1250000);
    assert.equal(n.parseAmount(''), null);
    assert.ok(Number.isNaN(n.parseAmount('lots')));
  });

  it('validates emails', () => {
    assert.equal(n.isValidEmail('a.b@example.co.uk'), true);
    assert.equal(n.isValidEmail('broken@'), false);
  });
});
