const { before, after, describe, it } = require('node:test');
const assert = require('node:assert/strict');
const app = require('../index');
const store = require('../data/store');
const { setProvisionDelay } = require('../tenant/provisioner');

const TYPES = ['clients', 'contacts', 'accounts', 'transactions'];

describe('Import API', () => {
  let server, baseURL, customerId;
  before(async () => {
    await new Promise((resolve, reject) => {
      server = app.listen(0, '127.0.0.1', resolve);
      server.once('error', reject);
    });
    baseURL = `http://127.0.0.1:${server.address().port}`;
  });
  after(async () => { if (server) await new Promise(resolve => server.close(resolve)); });
  const post = (url, data) => fetch(`${baseURL}${url}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data ?? {}) });

  async function createCustomer(name) {
    return (await (await post('/api/customers', { name, contactEmail: 'cs@example.com' })).json()).customer.id;
  }

  // Saves the real ABC sample files through the Data Mapping API.
  async function mapAbcSamples(id, types = TYPES) {
    for (const type of types) {
      const sample = await (await fetch(`${baseURL}/api/mapping/samples/abc-${type}`)).json();
      const response = await post(`/api/customers/${id}/mappings`, { ...sample, acceptRepairs: true, acceptUnmapped: true });
      assert.equal(response.status, 200, type);
    }
  }

  it('returns 404 for an unknown customer', async () => {
    assert.equal((await post('/api/customers/missing/import/dry-run')).status, 404);
    assert.equal((await post('/api/customers/missing/import')).status, 404);
    assert.equal((await fetch(`${baseURL}/api/customers/missing/import`)).status, 404);
  });

  it('blocks with 409 while Data Mapping is incomplete, listing the missing data types', async () => {
    customerId = await createCustomer('Import Test');
    await mapAbcSamples(customerId, ['clients', 'accounts']);
    store.upsertTenant(customerId, { status: 'active' });
    const response = await post(`/api/customers/${customerId}/import/dry-run`);
    assert.equal(response.status, 409);
    const body = await response.json();
    assert.deepEqual(body.blockers.map(blocker => blocker.code), ['data_mapping_incomplete']);
    assert.deepEqual(body.blockers[0].missing, ['contacts', 'transactions']);
    assert.match(body.blockers[0].message, /Contacts, Transactions/);
  });

  it('blocks with 409 when the tenant is missing or not active', async () => {
    const id = await createCustomer('No Tenant');
    await mapAbcSamples(id);
    let body = await (await post(`/api/customers/${id}/import/dry-run`)).json();
    assert.deepEqual(body.blockers.map(blocker => blocker.code), ['tenant_missing']);
    for (const status of ['pending', 'provisioning', 'failed']) {
      store.upsertTenant(id, { status });
      const response = await post(`/api/customers/${id}/import`);
      assert.equal(response.status, 409, status);
      body = await response.json();
      assert.deepEqual(body.blockers, [{ code: 'tenant_not_active', tenantStatus: status, message: `The tenant must be active before import (current status: ${status}).` }]);
    }
    assert.equal(store.getOnboardingState(id).steps[3].status, 'pending');
    assert.equal((await fetch(`${baseURL}/api/customers/${id}/import`)).status, 404);
  });

  it('dry-runs the ABC sample cleanly without importing anything', async () => {
    await mapAbcSamples(customerId, ['contacts', 'transactions']);
    const response = await post(`/api/customers/${customerId}/import/dry-run`);
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.deepEqual(result, { ready: true, counts: { accounts: 39, clients: 10, contacts: 15, transactions: 25 }, issues: [] });
    assert.equal((await fetch(`${baseURL}/api/customers/${customerId}/import`)).status, 404);
    assert.equal(store.getOnboardingState(customerId).steps[3].status, 'pending');
  });

  it('imports into the tenant store in dependency order and completes the Import step', async () => {
    const before = store.getOnboardingState(customerId).steps.map(step => step.status);
    const response = await post(`/api/customers/${customerId}/import`);
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.match(result.importId, /^imp_/);
    assert.ok(!Number.isNaN(Date.parse(result.importedAt)));
    assert.deepEqual(result.counts, { accounts: 39, clients: 10, contacts: 15, transactions: 25 });
    assert.deepEqual(result.issues, []);
    assert.deepEqual(result.onboarding.steps.map(step => step.status), [...before.slice(0, 3), 'completed']);
    assert.equal(result.onboarding.progressPercent, 75, 'Tenant Setup step is still owned by provisioning');

    const tenant = store.getTenantByCustomerId(customerId);
    const records = store.getTenantRecords(tenant.id);
    assert.deepEqual(Object.keys(records), ['accounts', 'clients', 'contacts', 'transactions']);
    assert.equal(records.transactions.length, 25);
    assert.ok(records.accounts.every(account => !account.parentId || records.accounts.some(parent => parent.id === account.parentId)));
    const last = await (await fetch(`${baseURL}/api/customers/${customerId}/import`)).json();
    assert.equal(last.importId, result.importId);
    assert.equal(last.records, undefined, 'the result does not expose raw records');
  });

  it('re-imports idempotently, replacing the previous import for the tenant', async () => {
    const tenant = store.getTenantByCustomerId(customerId);
    const first = store.getTenantRecords(tenant.id);
    const second = await (await post(`/api/customers/${customerId}/import`)).json();
    const records = store.getTenantRecords(tenant.id);
    assert.notEqual(records, first);
    assert.deepEqual(records, first);
    assert.equal(records.clients.length, 10);
    assert.equal((await (await fetch(`${baseURL}/api/customers/${customerId}/import`)).json()).importId, second.importId);
    assert.equal(store.getOnboardingState(customerId).steps.filter(step => step.status === 'completed').length, 3);
  });

  it('refuses with 400 when the dry run finds errors and keeps the previous import', async () => {
    const tenant = store.getTenantByCustomerId(customerId);
    const previous = store.getLastImport(customerId);
    // A contact whose client is not in the mapped clients file.
    const contacts = store.getCustomerMappings(customerId).find(mapping => mapping.datasetType === 'contacts');
    store.saveDataMapping(customerId, { ...contacts, mappedCsv: contacts.mappedCsv.replace(/\n([^,\n]+),([^,\n]+),/, '\n$1,NOPE,') });
    const dry = await (await post(`/api/customers/${customerId}/import/dry-run`)).json();
    assert.equal(dry.ready, false);
    assert.deepEqual(dry.issues.map(({ datasetType, row, field, severity }) => ({ datasetType, row, field, severity })), [
      { datasetType: 'contacts', row: 1, field: 'clientId', severity: 'error' }
    ]);
    const response = await post(`/api/customers/${customerId}/import`);
    assert.equal(response.status, 400);
    assert.equal((await response.json()).issues.length, 1);
    assert.equal(store.getLastImport(customerId).importId, previous.importId);
    assert.equal(store.getTenantRecords(tenant.id).contacts.length, 15);
  });

  it('reaches 100% once Tenant Setup has provisioned an active tenant', async () => {
    const id = await createCustomer('Paid Customer');
    await mapAbcSamples(id);
    setProvisionDelay(0);
    const defaults = await (await fetch(`${baseURL}/api/customers/${id}/tenant/defaults`)).json();
    assert.equal((await post(`/api/customers/${id}/tenant`, defaults)).status, 202);
    let tenant;
    for (let attempt = 0; attempt < 50 && tenant?.status !== 'active'; attempt++) {
      await new Promise(resolve => setTimeout(resolve, 10));
      tenant = await (await fetch(`${baseURL}/api/customers/${id}/tenant`)).json();
    }
    assert.equal(tenant.status, 'active');
    const result = await (await post(`/api/customers/${id}/import`)).json();
    assert.equal(result.onboarding.progressPercent, 100);
    assert.ok(result.onboarding.steps.every(step => step.status === 'completed'));
  });
});
