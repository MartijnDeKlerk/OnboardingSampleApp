const { before, after, describe, it } = require('node:test');
const assert = require('node:assert/strict');
const app = require('../index');

describe('Sample data profile API', () => {
  let server;
  let baseURL;
  before(async () => {
    await new Promise((resolve, reject) => {
      server = app.listen(0, '127.0.0.1', resolve);
      server.once('error', reject);
    });
    baseURL = `http://127.0.0.1:${server.address().port}`;
  });
  after(async () => {
    if (server) await new Promise(resolve => server.close(resolve));
  });

  const get = path => fetch(`${baseURL}${path}`);

  it('lists the sample-data folders sorted by id', async () => {
    const response = await get('/api/sample-data');
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), [
      { id: 'CustomerA_ABCAccounting', label: 'ABC Accounting' },
      { id: 'CustomerB_XYZFinancialServices', label: 'XYZ Financial Services' },
      { id: 'CustomerC_PremierBookkeeping', label: 'Premier Bookkeeping' }
    ]);
  });

  const expected = {
    CustomerA_ABCAccounting: {
      label: 'ABC Accounting', industry: 'Accounting', region: 'North America',
      schemaStyle: 'Title Case', dateFormat: 'MM/DD/YYYY', currency: 'USD',
      counts: { clients: 10, contacts: 15, chartOfAccounts: 39, transactions: 25 }
    },
    CustomerB_XYZFinancialServices: {
      label: 'XYZ Financial Services', industry: 'Financial Services', region: 'North America',
      schemaStyle: 'camelCase', dateFormat: 'YYYY-MM-DD', currency: 'USD',
      counts: { clients: 12, contacts: 18, chartOfAccounts: 39, transactions: 25 }
    },
    CustomerC_PremierBookkeeping: {
      label: 'Premier Bookkeeping', industry: 'Bookkeeping', region: 'United Kingdom',
      schemaStyle: 'snake_case', dateFormat: 'DD-MM-YYYY', currency: 'GBP',
      counts: { clients: 12, contacts: 20, chartOfAccounts: 39, transactions: 25 }
    }
  };

  for (const [id, want] of Object.entries(expected)) {
    it(`profiles ${id}`, async () => {
      const response = await get(`/api/sample-data/${id}/profile`);
      assert.equal(response.status, 200);
      const profile = await response.json();
      assert.equal(profile.id, id);
      assert.equal(profile.label, want.label);
      assert.deepEqual(profile.suggestedCustomer, { name: want.label, industry: want.industry, region: want.region, contactEmail: '' });
      assert.equal(profile.schemaStyle, want.schemaStyle);
      assert.equal(profile.dateFormat, want.dateFormat);
      assert.equal(profile.currency, want.currency);
      assert.deepEqual(profile.counts, want.counts);
      assert.equal(profile.clients.length, want.counts.clients);
      assert.equal(profile.contacts.length, want.counts.contacts);
      for (const client of profile.clients) {
        assert.ok(['Active', 'Inactive', 'Pending'].includes(client.status), client.status);
        assert.ok(['Corporation', 'S-Corporation', 'LLC', 'Partnership', 'Sole Proprietor', 'Non-Profit'].includes(client.entityType), client.entityType);
        assert.match(client.startDate, /^\d{4}-\d{2}-\d{2}$/);
        assert.equal(typeof client.annualRevenue, 'number');
      }
      for (const contact of profile.contacts) assert.ok(['Active', 'Inactive'].includes(contact.status), contact.status);
    });
  }

  // These assertions hold for both the original CSVs (unquoted commas) and the
  // fixed, quoted ones, so they deliberately say nothing about overflow issues.
  it('normalises XYZ values: "Last, First" contacts, sector codes, terms and Y/N/P statuses', async () => {
    const profile = await (await get('/api/sample-data/CustomerB_XYZFinancialServices/profile')).json();
    assert.deepEqual(profile.clients[0], {
      id: 'XYZ-001', name: 'Apex Digital Marketing', entityType: 'Corporation', status: 'Active',
      startDate: '2023-02-10', taxId: '11-2233445', annualRevenue: 1850000, industry: 'Technology',
      paymentTerms: 'Net 30', primaryContact: 'Robert Williams'
    });
    assert.deepEqual(profile.clients.map(c => c.primaryContact).slice(-1), ['Patricia Hall']);
    assert.deepEqual(profile.clients.map(c => c.status), ['Active', 'Active', 'Active', 'Inactive', 'Active', 'Active', 'Active', 'Pending', 'Active', 'Active', 'Active', 'Inactive']);
    assert.equal(profile.contacts.find(c => c.id === 'CON-006').status, 'Inactive');
    assert.equal(profile.contacts.find(c => c.id === 'CON-013').status, 'Inactive');
  });

  it('normalises ABC and Premier picklists and dates', async () => {
    const abc = await (await get('/api/sample-data/CustomerA_ABCAccounting/profile')).json();
    assert.deepEqual(abc.clients.map(c => c.entityType), ['Corporation', 'Partnership', 'S-Corporation', 'Sole Proprietor', 'Corporation', 'Non-Profit', 'Partnership', 'Corporation', 'LLC', 'S-Corporation']);
    assert.equal(abc.clients[0].startDate, '2023-01-15');
    const premier = await (await get('/api/sample-data/CustomerC_PremierBookkeeping/profile')).json();
    assert.deepEqual(premier.clients.slice(0, 4).map(c => [c.entityType, c.status, c.startDate, c.paymentTerms]), [
      ['Sole Proprietor', 'Active', '2023-03-15', 'Due on Receipt'],
      ['Corporation', 'Active', '2023-05-22', 'Net 30'],
      ['LLC', 'Active', '2023-07-10', 'Net 45'],
      ['Corporation', 'Inactive', '2022-01-28', 'Net 60']
    ]);
    assert.equal(premier.clients.find(c => c.id === 'PB-0010').status, 'Pending');
    assert.equal(premier.contacts.find(c => c.id === 'CTR-018').status, 'Inactive');
  });

  it('finds no client or contact errors in any real sample folder', async () => {
    for (const id of Object.keys(expected)) {
      const profile = await (await get(`/api/sample-data/${id}/profile`)).json();
      for (const issue of profile.issues) {
        assert.deepEqual(Object.keys(issue).sort(), ['field', 'file', 'message', 'row', 'severity']);
        assert.ok(['error', 'warning'].includes(issue.severity));
      }
      const errors = profile.issues.filter(i => ['clients.csv', 'contacts.csv'].includes(i.file) && i.severity === 'error');
      assert.deepEqual(errors, [], id);
    }
  });

  it('returns 404 for an unknown id', async () => {
    const response = await get('/api/sample-data/CustomerD_Nobody/profile');
    assert.equal(response.status, 404);
    assert.ok((await response.json()).error);
  });

  it('rejects path traversal and near-miss ids', async () => {
    const attempts = [
      '..%2F..%2Fserver',
      '..%2Fsample-data',
      'CustomerA_ABCAccounting%2F..%2FCustomerB_XYZFinancialServices',
      '%2E%2E%2Fpackage.json',
      'customera_abcaccounting',
      'README.md'
    ];
    for (const id of attempts) {
      const response = await get(`/api/sample-data/${id}/profile`);
      assert.equal(response.status, 404, id);
      assert.ok((await response.json()).error, id);
    }
  });
});
