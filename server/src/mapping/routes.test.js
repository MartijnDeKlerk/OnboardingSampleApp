const { before, after, describe, it } = require('node:test');
const assert = require('node:assert/strict');
const app = require('../index');
const store = require('../data/store');

describe('Data Mapping API', () => {
  let server, baseURL, sample, customerId;
  before(async () => {
    await new Promise((resolve, reject) => {
      server = app.listen(0, '127.0.0.1', resolve);
      server.once('error', reject);
    });
    baseURL = `http://127.0.0.1:${server.address().port}`;
  });
  after(async () => { if (server) await new Promise(resolve => server.close(resolve)); });
  const post = (url, data) => fetch(`${baseURL}${url}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });

  it('provides a fixed catalog of samples without accepting arbitrary file paths', async () => {
    const options = await (await fetch(`${baseURL}/api/mapping/options`)).json();
    assert.equal(options.datasets.length, 4);
    assert.equal(options.samples.length, 12);
    assert.equal((await fetch(`${baseURL}/api/mapping/samples/not-a-sample`)).status, 404);
    sample = await (await fetch(`${baseURL}/api/mapping/samples/xyz-clients`)).json();
    assert.ok(sample.csv.includes('Williams, Robert'));
    assert.ok(sample.csv.includes('"Williams, Robert"'), 'the already-fixed repository sample stays unchanged');
    sample = { ...sample, csv: sample.csv.replace(/"([^"\r\n]+,[^"\r\n]+)"(?=\r?$)/gm, '$1') };
  });

  it('previews proposed repairs without changing onboarding state or saving data', async () => {
    const response = await post('/api/mapping/preview', sample);
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.repairs.length, 12);
    assert.deepEqual(result.errors, []);
    assert.equal(store.getCustomerMappings('cust_001').length, 0);
    assert.equal(store.getOnboardingState('cust_001').progressPercent, 0);
  });

  it('requires Customer Info before completing Data Mapping', async () => {
    const response = await post('/api/customers/cust_001/mappings', { ...sample, acceptRepairs: true });
    assert.equal(response.status, 409);
    assert.equal(store.getOnboardingState('cust_001').progressPercent, 0);
  });

  it('requires acceptance of proposed repairs, then saves original and prepared CSVs at 50%', async () => {
    const created = await (await post('/api/customers', { name: 'Mapping Test', contactEmail: 'cs@example.com' })).json();
    customerId = created.customer.id;
    const rejected = await post(`/api/customers/${customerId}/mappings`, sample);
    assert.equal(rejected.status, 400);
    assert.equal(store.getCustomerMappings(customerId).length, 0);
    const response = await post(`/api/customers/${customerId}/mappings`, { ...sample, acceptRepairs: true });
    assert.equal(response.status, 200);
    const saved = await response.json();
    assert.equal(saved.mapping.totalRows, 12);
    assert.equal(saved.mapping.originalCsv, sample.csv);
    assert.ok(saved.mapping.correctedCsv.includes('"Williams, Robert"'));
    assert.ok(saved.mapping.mappedCsv.startsWith('id,name,'));
    assert.equal(saved.onboarding.progressPercent, 50);
    assert.equal(saved.onboarding.steps[2].status, 'pending');
    assert.equal(saved.onboarding.steps[3].status, 'pending');
    const restored = await (await fetch(`${baseURL}/api/customers/${customerId}/mappings`)).json();
    assert.equal(restored[0].originalCsv, sample.csv);
    assert.equal(restored[0].columnMapping.primaryContact, 'mainContact');
    assert.deepEqual(await (await fetch(`${baseURL}/api/customers/cust_001/mappings`)).json(), []);
  });

  it('revalidates on save and preserves an earlier valid mapping when the next CSV is invalid', async () => {
    const response = await post(`/api/customers/${customerId}/mappings`, {
      csv: 'id,name\n1,Extra,column\n', datasetType: 'clients', acceptRepairs: true
    });
    assert.equal(response.status, 400);
    assert.equal(store.getCustomerMappings(customerId)[0].totalRows, 12);
    assert.equal(store.getOnboardingState(customerId).progressPercent, 50);
  });

  it('requires explicit acceptance before excluding source columns', async () => {
    const body = { csv: 'Code,Company,Extra\n001,Example,Keep this\n', datasetType: 'clients', mapping: { id: 'Code', name: 'Company' } };
    assert.equal((await post(`/api/customers/${customerId}/mappings`, body)).status, 400);
    const response = await post(`/api/customers/${customerId}/mappings`, { ...body, acceptUnmapped: true });
    assert.equal(response.status, 200);
    const saved = await response.json();
    assert.ok(saved.mapping.correctedCsv.includes('Keep this'));
    assert.ok(!saved.mapping.mappedCsv.includes('Keep this'));
    assert.equal(store.getCustomerMappings(customerId).length, 1, 'saving the same dataset replaces it');
  });

  it('returns JSON for malformed JSON and rejects nonexistent customers', async () => {
    const malformed = await fetch(`${baseURL}/api/mapping/preview`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' });
    assert.equal(malformed.status, 400);
    assert.ok(malformed.headers.get('content-type').includes('application/json'));
    assert.equal((await post('/api/customers/missing/mappings', sample)).status, 404);
  });
});
