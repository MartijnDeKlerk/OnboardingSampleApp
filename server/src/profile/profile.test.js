const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { buildProfile, labelFromFolder } = require('./profile');

const clientsHeader = 'Client ID,Client Name,Business Type,Status,Date Onboarded,Tax ID,Annual Revenue,Industry,Payment Terms,Primary Contact';
const contactsHeader = 'Contact ID,Client ID,First Name,Last Name,Email,Phone,Role,Status';

function profileOf(clientRows, contactRows) {
  return buildProfile('CustomerZ_TestTaxAdvisors', {
    'clients.csv': [clientsHeader, ...clientRows].join('\n'),
    'contacts.csv': [contactsHeader, ...contactRows].join('\n'),
    'chart_of_accounts.csv': 'Account Number,Account Name\n1000,Cash\n',
    'transactions.csv': 'Transaction ID,Date,Amount\nT1,01/15/2024,10.00\n'
  });
}

const issuesFor = (profile, file) => profile.issues.filter(i => i.file === file).map(i => `${i.row}:${i.field}:${i.severity}`);

describe('labelFromFolder', () => {
  it('derives readable labels from folder names', () => {
    assert.equal(labelFromFolder('CustomerA_ABCAccounting'), 'ABC Accounting');
    assert.equal(labelFromFolder('CustomerB_XYZFinancialServices'), 'XYZ Financial Services');
    assert.equal(labelFromFolder('CustomerC_PremierBookkeeping'), 'Premier Bookkeeping');
  });
});

describe('buildProfile', () => {
  it('reports no issues for clean data', () => {
    const profile = profileOf(
      ['C1,Acme,LLC,Active,01/15/2023,12-3456789,1000.00,Retail,Net 30,Ann Lee'],
      ['CT1,C1,Ann,Lee,ann@acme.com,555,Owner,Active']
    );
    assert.deepEqual(profile.issues, []);
    assert.equal(profile.label, 'Test Tax Advisors');
    assert.deepEqual(profile.suggestedCustomer, { name: 'Test Tax Advisors', industry: 'Tax Services', region: 'North America', contactEmail: '' });
    assert.equal(profile.currency, 'USD');
    assert.deepEqual(profile.counts, { clients: 1, contacts: 1, chartOfAccounts: 1, transactions: 1 });
  });

  it('flags genuine client and contact problems', () => {
    const profile = profileOf([
      'C1,Acme,LLC,Active,02/30/2023,12-3456789,abc,Retail,Net 30,Ann Lee',
      'C1,,Trust,Closed,,BAD,500,Retail,Net 30,Nobody Here',
      'C3,Solo,LLC,Active,01/01/2023,12-3456789,,Retail,Net 30,'
    ], [
      'CT1,C1,Ann,Lee,ann@acme,555,Owner,Active',
      'CT1,C9,Bob,Ray,,555,Owner,Maybe'
    ]);
    assert.deepEqual(issuesFor(profile, 'clients.csv'), [
      '1:startDate:error', '1:annualRevenue:error',
      '2:id:error', '2:name:error', '2:entityType:warning', '2:status:warning', '2:startDate:warning', '2:taxId:warning', '2:primaryContact:warning',
      '3:id:warning'
    ]);
    assert.deepEqual(issuesFor(profile, 'contacts.csv'), [
      '1:email:error', '2:id:error', '2:clientId:error', '2:email:warning', '2:status:warning'
    ]);
    assert.equal(profile.clients[0].startDate, null);
    assert.equal(profile.clients[0].annualRevenue, null);
    assert.equal(profile.clients[1].status, 'Closed');
    assert.equal(profile.clients[2].annualRevenue, null);
  });

  it('flags a primary contact who is not one of the client contacts', () => {
    const profile = profileOf(
      ['C1,Acme,LLC,Active,01/15/2023,12-3456789,1000.00,Retail,Net 30,Zed Zee'],
      ['CT1,C1,Ann,Lee,ann@acme.com,555,Owner,Active']
    );
    assert.deepEqual(issuesFor(profile, 'clients.csv'), ['1:primaryContact:warning']);
  });

  it('repairs a "Last, First" primary contact split by an unquoted comma', () => {
    const profile = profileOf(
      ['C1,Acme,LLC,Active,01/15/2023,12-3456789,1000.00,Retail,Net 30,Lee, Ann'],
      ['CT1,C1,Ann,Lee,ann@acme.com,555,Owner,Active']
    );
    assert.equal(profile.clients[0].primaryContact, 'Ann Lee');
    assert.equal(profile.clients[0].paymentTerms, 'Net 30');
    assert.deepEqual(issuesFor(profile, 'clients.csv'), ['1:primaryContact:warning']);
  });

  it('reports an unquoted comma in a middle client column as an error and keeps only the ID', () => {
    const profile = profileOf(
      ['C1,Acme, Inc,LLC,Active,01/15/2023,12-3456789,1000.00,Retail,Net 30,Ann Lee'],
      ['CT1,C1,Ann,Lee,ann@acme.com,555,Owner,Active']
    );
    assert.deepEqual(issuesFor(profile, 'clients.csv'), ['1::error']);
    assert.equal(profile.counts.clients, 1);
    assert.deepEqual(profile.clients[0], {
      id: 'C1', name: '', entityType: '', status: '', startDate: null, taxId: '',
      annualRevenue: null, industry: '', paymentTerms: '', primaryContact: ''
    });
    assert.deepEqual(issuesFor(profile, 'contacts.csv'), []);
  });

  it('reports missing files instead of failing', () => {
    const profile = buildProfile('CustomerQ_Empty', {});
    assert.deepEqual(profile.counts, { clients: 0, contacts: 0, chartOfAccounts: 0, transactions: 0 });
    assert.equal(profile.issues.length, 4);
    assert.ok(profile.issues.every(i => i.severity === 'error' && i.row === 0));
  });

  it('derives UK region and GBP from data signals, not the folder name', () => {
    const profile = buildProfile('CustomerA_Anything', {
      'clients.csv': 'customer_id,business_name,registration_date,tax_reference\nX1,Shop,15-03-2023,GB123456789\n',
      'contacts.csv': 'contact_ref,customer_id,given_name,family_name,email,telephone\nK1,X1,Al,Bo,al@shop.co.uk,+44 7700 100001\n',
      'transactions.csv': 'transaction_ref,posting_date,amount_gbp\nT1,15-01-2024,10.00\n'
    });
    assert.equal(profile.schemaStyle, 'snake_case');
    assert.equal(profile.dateFormat, 'DD-MM-YYYY');
    assert.equal(profile.suggestedCustomer.region, 'United Kingdom');
    assert.equal(profile.currency, 'GBP');
    assert.equal(profile.clients[0].startDate, '2023-03-15');
  });
});
