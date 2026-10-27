// @ts-check
const { test, expect } = require('@playwright/test');

async function createCustomer(request, details) {
  const response = await request.post('/api/customers', { data: { contactEmail: 'cs@example.com', ...details } });
  expect(response.ok()).toBeTruthy();
  return (await response.json()).customer;
}

async function openTenantSetup(page, customerId) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Tenant Setup', exact: true }).click();
  await page.getByLabel('Customer', { exact: true }).selectOption(customerId);
}

function dashboardCard(page, name) {
  return page.locator('.customer-card').filter({ has: page.getByRole('heading', { name, exact: true }) });
}

test('provisions a tenant pre-filled from Customer Info and completes Tenant Setup', async ({ page, request }) => {
  const stamp = Date.now();
  const customer = await createCustomer(request, { name: `Tenant UK ${stamp}`, region: 'United Kingdom', contactEmail: 'admin@tenant-uk.example' });
  await openTenantSetup(page, customer.id);

  await expect(page.getByLabel('Plan', { exact: true })).toHaveValue('professional');
  await expect(page.getByLabel('Subdomain', { exact: true })).toHaveValue(`tenant-uk-${stamp}`);
  await expect(page.getByLabel('Data region', { exact: true })).toHaveValue('EU');
  await expect(page.getByLabel('Currency', { exact: true })).toHaveValue('GBP');
  await expect(page.getByLabel('Date format', { exact: true })).toHaveValue('DD/MM/YYYY');
  await expect(page.getByLabel('Admin email', { exact: true })).toHaveValue('admin@tenant-uk.example');
  await expect(page.locator('.tenant-summary')).toContainText('No tenant');

  // Server-side validation: reserved names are rejected before provisioning.
  await page.getByLabel('Subdomain', { exact: true }).fill('admin');
  await page.getByRole('button', { name: 'Provision tenant', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Check the highlighted fields.');
  await expect(page.getByText('"admin" is reserved. Choose a different subdomain.', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Subdomain', { exact: true })).toHaveAttribute('aria-invalid', 'true');

  await page.getByLabel('Subdomain', { exact: true }).fill(`tenant-uk-${stamp}`);
  await page.getByLabel('Plan', { exact: true }).selectOption('enterprise');
  await page.getByRole('button', { name: 'Provision tenant', exact: true }).click();
  await expect(page.getByRole('status')).toContainText(`Provisioning tenant-uk-${stamp}`);
  await expect(page.locator('.tenant-summary')).toContainText('Provisioning');
  await expect(page.getByRole('status')).toContainText('Tenant Setup is complete. Onboarding progress: 50%.', { timeout: 10000 });
  await expect(page.locator('.tenant-summary')).toContainText('Active');
  await expect(page.getByRole('button', { name: 'Re-provision with changes', exact: true })).toBeEnabled();

  await page.getByRole('button', { name: 'Dashboard', exact: true }).click();
  const card = dashboardCard(page, customer.name);
  await expect(card).toContainText('50%');
  await expect(card.locator('.tenant-badge')).toHaveText('Active');
  await expect(card.locator('.step-status.completed')).toHaveCount(2);

  const tenant = await (await request.get(`/api/customers/${customer.id}/tenant`)).json();
  expect(tenant).toMatchObject({ status: 'active', plan: 'enterprise', subdomain: `tenant-uk-${stamp}`, currency: 'GBP' });
});

test('shows a readable failure and retries provisioning', async ({ page, request }) => {
  const stamp = Date.now();
  const customer = await createCustomer(request, { name: `Retry Tenant ${stamp}` });
  await openTenantSetup(page, customer.id);
  await expect(page.getByLabel('Currency', { exact: true })).toHaveValue('USD');

  await page.getByLabel('Subdomain', { exact: true }).fill(`fail-${stamp}`);
  await page.getByRole('button', { name: 'Provision tenant', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Provisioning failed.', { timeout: 10000 });
  await expect(page.getByRole('alert')).toContainText(`could not create "fail-${stamp}"`);
  await expect(page.locator('.tenant-summary')).toContainText('Failed');

  await page.getByRole('button', { name: 'Dashboard', exact: true }).click();
  await expect(dashboardCard(page, customer.name).locator('.tenant-badge')).toHaveText('Failed');
  await page.getByRole('button', { name: 'Tenant Setup', exact: true }).click();
  await expect(page.getByLabel('Subdomain', { exact: true })).toHaveValue(`fail-${stamp}`);

  await page.getByLabel('Subdomain', { exact: true }).fill(`retry-tenant-${stamp}`);
  await page.getByRole('button', { name: 'Retry provisioning', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByRole('status')).toContainText('Onboarding progress: 50%.', { timeout: 10000 });
  await page.getByRole('button', { name: 'Dashboard', exact: true }).click();
  const card = dashboardCard(page, customer.name);
  await expect(card.locator('.tenant-badge')).toHaveText('Active');
  await expect(card).toContainText('50%');
});

test('blocks Tenant Setup until Customer Info is complete', async ({ page, request }) => {
  const customer = await createCustomer(request, { name: `Blocked Tenant ${Date.now()}` });
  // Every customer created through the API completes Customer Info, so simulate an incomplete one.
  await page.route(`**/api/customers/${customer.id}/onboarding`, async route => {
    const state = await (await route.fetch()).json();
    state.steps = state.steps.map(step => step.id === 'step_1' ? { ...step, status: 'pending' } : step);
    state.progressPercent = 0;
    await route.fulfill({ json: state });
  });
  await openTenantSetup(page, customer.id);
  await expect(page.getByText('Save Customer Info for this customer before setting up the tenant.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Provision tenant', exact: true })).toBeDisabled();
  await expect(page.getByLabel('Subdomain', { exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Open Customer Info', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Customer Info', exact: true })).toBeVisible();

  // The seeded Acme customer has not completed Customer Info; the API refuses with a readable error.
  const acme = await request.get('/api/customers/cust_001/onboarding');
  if ((await acme.json()).steps[0].status !== 'completed') {
    const response = await request.post('/api/customers/cust_001/tenant', { data: {} });
    expect(response.status()).toBe(409);
    expect((await response.json()).error).toContain('Save Customer Info');
  }
});
