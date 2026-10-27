const { before, after, describe, it } = require('node:test');
const assert = require('node:assert/strict');
const app = require('../index');
const store = require('../data/store');

describe('Customer Info API', () => {
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

  function save(path, method, data) {
    return fetch(`${baseURL}${path}`, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
  }

  it('returns field errors without creating a customer', async () => {
    const beforeCount = store.getCustomers().length;
    const response = await save('/api/customers', 'POST', { name: '  ', contactEmail: 'not-an-email' });
    assert.equal(response.status, 400);
    const result = await response.json();
    assert.ok(result.errors.name);
    assert.ok(result.errors.contactEmail);
    assert.equal(store.getCustomers().length, beforeCount);
  });

  it('creates a customer, completes the first step, and exposes it on the dashboard', async () => {
    const response = await save('/api/customers', 'POST', { name: ' ABC Accounting ', contactEmail: ' cs@example.com ', industry: ' Accounting ', region: ' UK ', id: 'injected' });
    assert.equal(response.status, 201);
    const { customer, onboarding } = await response.json();
    assert.equal(customer.name, 'ABC Accounting');
    assert.equal(customer.contactEmail, 'cs@example.com');
    assert.equal(customer.industry, 'Accounting');
    assert.equal(customer.region, 'UK');
    assert.notEqual(customer.id, 'injected');
    assert.equal(onboarding.progressPercent, 25);
    assert.equal(onboarding.steps[0].status, 'completed');
    assert.ok(onboarding.steps.slice(1).every(step => step.status === 'pending'));
    assert.equal(store.getTenantByCustomerId(customer.id), undefined);
    const dashboard = await (await fetch(`${baseURL}/api/onboarding`)).json();
    assert.equal(dashboard.find(row => row.customerId === customer.id).customerName, 'ABC Accounting');
  });

  it('edits an existing customer without duplicating it or clearing later progress', async () => {
    const beforeCount = store.getCustomers().length;
    const original = store.getCustomerById('cust_001');
    const createdAt = original.createdAt;
    const state = store.getOnboardingState(original.id);
    store.updateOnboardingState(original.id, {
      steps: state.steps.map(step => step.id === 'step_2' ? { ...step, status: 'completed' } : step)
    });
    const response = await save('/api/customers/cust_001', 'PUT', { name: 'Acme Updated', contactEmail: 'new@example.com', createdAt: 'injected' });
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.customer.id, 'cust_001');
    assert.equal(result.customer.createdAt, createdAt);
    assert.equal(result.onboarding.progressPercent, 50);
    assert.equal(result.onboarding.steps[1].status, 'completed');
    assert.equal(store.getCustomers().length, beforeCount);
    const saved = await (await fetch(`${baseURL}/api/customers/cust_001`)).json();
    assert.equal(saved.name, 'Acme Updated');
  });

  it('does not overwrite existing information when validation fails', async () => {
    const original = { ...store.getCustomerById('cust_001') };
    const response = await save('/api/customers/cust_001', 'PUT', { name: '', contactEmail: 'invalid' });
    assert.equal(response.status, 400);
    assert.deepEqual(store.getCustomerById('cust_001'), original);
  });

  it('returns 404 when editing a nonexistent customer', async () => {
    const response = await save('/api/customers/missing', 'PUT', { name: 'Company', contactEmail: 'cs@example.com' });
    assert.equal(response.status, 404);
    assert.equal((await response.json()).error, 'Customer not found');
  });
});
