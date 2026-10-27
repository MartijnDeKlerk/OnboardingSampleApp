const { before, after, describe, it } = require('node:test');
const assert = require('node:assert/strict');
const app = require('../index');
const store = require('../data/store');
const { setProvisionDelay } = require('./provisioner');

describe('Tenant Setup API', () => {
  let server, baseURL;
  before(async () => {
    setProvisionDelay(0);
    await new Promise((resolve, reject) => {
      server = app.listen(0, '127.0.0.1', resolve);
      server.once('error', reject);
    });
    baseURL = `http://127.0.0.1:${server.address().port}`;
  });
  after(async () => { if (server) await new Promise(resolve => server.close(resolve)); });

  const get = url => fetch(`${baseURL}${url}`);
  const post = (url, data) => fetch(`${baseURL}${url}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
  const createCustomer = async details => (await (await post('/api/customers', { contactEmail: 'cs@example.com', ...details })).json()).customer;
  const defaults = async id => (await get(`/api/customers/${id}/tenant/defaults`)).json();
  async function settled(id) {
    for (let i = 0; i < 50; i += 1) {
      const tenant = await (await get(`/api/customers/${id}/tenant`)).json();
      if (tenant.status !== 'provisioning') return tenant;
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    throw new Error('Provisioning did not finish');
  }

  it('suggests defaults from Customer Info and returns 404 before a tenant exists', async () => {
    const customer = await createCustomer({ name: 'ABC Accounting', region: 'UK', contactEmail: 'cs@abc.example' });
    assert.deepEqual(await defaults(customer.id), {
      plan: 'professional', subdomain: 'abc-accounting', dataRegion: 'EU', currency: 'GBP', dateFormat: 'DD/MM/YYYY', adminEmail: 'cs@abc.example'
    });
    assert.equal((await get(`/api/customers/${customer.id}/tenant`)).status, 404);
    assert.equal((await get('/api/customers/missing/tenant')).status, 404);
    assert.equal((await get('/api/customers/missing/tenant/defaults')).status, 404);
    assert.equal((await post('/api/customers/missing/tenant', {})).status, 404);
  });

  it('requires Customer Info before provisioning, but not Data Mapping', async () => {
    const response = await post('/api/customers/cust_001/tenant', await defaults('cust_001'));
    assert.equal(response.status, 409);
    assert.match((await response.json()).error, /Customer Info/);
    assert.equal(store.getTenantByCustomerId('cust_001').status, 'pending');
    assert.equal(store.getOnboardingState('cust_001').progressPercent, 0);
  });

  it('returns field errors without changing the tenant', async () => {
    const customer = await createCustomer({ name: 'Validation Co' });
    const response = await post(`/api/customers/${customer.id}/tenant`, { plan: 'gold', subdomain: 'api', dataRegion: 'EU', currency: 'EUR', dateFormat: 'DD/MM/YYYY', adminEmail: 'bad' });
    assert.equal(response.status, 400);
    const result = await response.json();
    assert.equal(result.error, 'Check the highlighted fields.');
    assert.ok(result.errors.plan);
    assert.match(result.errors.subdomain, /reserved/);
    assert.ok(result.errors.adminEmail);
    assert.equal(store.getTenantByCustomerId(customer.id), undefined);
  });

  it('provisions pending → provisioning → active and completes only Tenant Setup (50%)', async () => {
    store.saveCustomerInfo('cust_001', { ...store.getCustomerById('cust_001') });
    const config = await defaults('cust_001');
    assert.equal(config.subdomain, 'acme-corporation');
    assert.equal(config.dataRegion, 'US');
    const tenantCount = store.getTenants().length;
    const response = await post('/api/customers/cust_001/tenant', { ...config, plan: 'enterprise' });
    assert.equal(response.status, 202);
    const started = await response.json();
    assert.equal(started.tenant.id, 'tenant_001', 'reuses the seeded pending tenant');
    assert.equal(started.tenant.status, 'provisioning');
    assert.equal(started.onboarding.steps[2].status, 'in_progress');
    assert.equal(store.getTenants().length, tenantCount);

    const tenant = await settled('cust_001');
    assert.equal(tenant.status, 'active');
    assert.equal(tenant.plan, 'enterprise');
    assert.equal(tenant.subdomain, 'acme-corporation');
    assert.ok(tenant.provisionedAt);
    const onboarding = store.getOnboardingState('cust_001');
    assert.deepEqual(onboarding.steps.map(step => step.status), ['completed', 'pending', 'completed', 'pending']);
    assert.equal(onboarding.progressPercent, 50);
    const dashboard = await (await get('/api/onboarding')).json();
    assert.equal(dashboard.find(row => row.customerId === 'cust_001').tenantStatus, 'active');
    assert.equal((await (await get('/api/tenants/cust_001')).json()).status, 'active', 'legacy endpoint still works');
  });

  it('preserves other completed steps and reports provisioning while in progress', async () => {
    const customer = await createCustomer({ name: 'Slow Co', region: 'Germany' });
    const state = store.getOnboardingState(customer.id);
    store.updateOnboardingState(customer.id, { steps: state.steps.map(step => step.id === 'step_2' ? { ...step, status: 'completed' } : step) });
    setProvisionDelay(100);
    try {
      assert.equal((await post(`/api/customers/${customer.id}/tenant`, await defaults(customer.id))).status, 202);
      assert.equal((await (await get(`/api/customers/${customer.id}/tenant`)).json()).status, 'provisioning');
      const again = await post(`/api/customers/${customer.id}/tenant`, await defaults(customer.id));
      assert.equal(again.status, 409, 'cannot start a second run while provisioning');
    } finally {
      setProvisionDelay(0);
    }
    for (let i = 0; i < 50 && store.getTenantByCustomerId(customer.id).status === 'provisioning'; i += 1) {
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    const tenant = store.getTenantByCustomerId(customer.id);
    assert.equal(tenant.status, 'active');
    assert.deepEqual([tenant.dataRegion, tenant.currency], ['EU', 'EUR']);
    assert.equal(store.getOnboardingState(customer.id).progressPercent, 75);
  });

  it('rejects a subdomain already used by another tenant and suggests a free one', async () => {
    const customer = await createCustomer({ name: 'Acme Corporation' });
    const config = await defaults(customer.id);
    assert.equal(config.subdomain, 'acme-corporation-2');
    const response = await post(`/api/customers/${customer.id}/tenant`, { ...config, subdomain: 'acme-corporation' });
    assert.equal(response.status, 400);
    assert.match((await response.json()).errors.subdomain, /already used/);
  });

  it('fails deterministically for fail- subdomains, then succeeds on retry', async () => {
    const customer = await createCustomer({ name: 'Retry Co' });
    const config = await defaults(customer.id);
    assert.equal((await post(`/api/customers/${customer.id}/tenant`, { ...config, subdomain: 'fail-retry-co' })).status, 202);
    const failed = await settled(customer.id);
    assert.equal(failed.status, 'failed');
    assert.match(failed.failureReason, /fail-retry-co/);
    let onboarding = store.getOnboardingState(customer.id);
    assert.equal(onboarding.steps[2].status, 'failed');
    assert.equal(onboarding.progressPercent, 25);
    const dashboard = await (await get('/api/onboarding')).json();
    assert.equal(dashboard.find(row => row.customerId === customer.id).tenantStatus, 'failed');

    const tenantId = failed.id;
    assert.equal((await post(`/api/customers/${customer.id}/tenant`, config)).status, 202);
    const active = await settled(customer.id);
    assert.equal(active.status, 'active');
    assert.equal(active.id, tenantId, 'retry updates the same tenant');
    assert.equal(active.failureReason, null);
    onboarding = store.getOnboardingState(customer.id);
    assert.equal(onboarding.steps[2].status, 'completed');
    assert.equal(onboarding.progressPercent, 50);
  });

  it('re-provisions an active tenant only for config changes and keeps Tenant Setup complete', async () => {
    const customer = await createCustomer({ name: 'Change Co' });
    const config = await defaults(customer.id);
    await post(`/api/customers/${customer.id}/tenant`, config);
    assert.equal((await settled(customer.id)).status, 'active');

    const unchanged = await post(`/api/customers/${customer.id}/tenant`, config);
    assert.equal(unchanged.status, 409);
    assert.match((await unchanged.json()).error, /already active/);

    const changed = await post(`/api/customers/${customer.id}/tenant`, { ...config, plan: 'starter' });
    assert.equal(changed.status, 202);
    assert.equal((await changed.json()).onboarding.steps[2].status, 'completed');
    assert.equal((await settled(customer.id)).plan, 'starter');

    await post(`/api/customers/${customer.id}/tenant`, { ...config, subdomain: 'fail-change-co' });
    assert.equal((await settled(customer.id)).status, 'failed');
    assert.equal(store.getOnboardingState(customer.id).steps[2].status, 'completed');
    assert.equal(store.getOnboardingState(customer.id).progressPercent, 50);
  });
});
