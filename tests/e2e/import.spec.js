const { test, expect } = require('@playwright/test');
const fs = require('node:fs');

// Saves sample files through the Data Mapping API. `samples` maps data type -> sample prefix.
async function mapSamples(request, customerId, samples) {
  for (const [type, prefix] of Object.entries(samples)) {
    const sample = await (await request.get(`/api/mapping/samples/${prefix}-${type}`)).json();
    const saved = await request.post(`/api/customers/${customerId}/mappings`, { data: { ...sample, acceptRepairs: true, acceptUnmapped: true } });
    expect(saved.ok(), type).toBeTruthy();
  }
}

async function createCustomer(request, name) {
  const created = await request.post('/api/customers', { data: { name: `${name} ${Date.now()}`, contactEmail: 'cs@example.com' } });
  return (await created.json()).customer;
}

// Tenant Setup is built separately; the test-support route stands in for provisioning.
async function activateTenant(request, customerId) {
  const response = await request.put(`/api/test-support/tenants/${customerId}`, { data: { status: 'active' } });
  expect(response.ok()).toBeTruthy();
}

async function openImport(page, customerId) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Import', exact: true }).click();
  await page.getByLabel('Customer', { exact: true }).selectOption(customerId);
}

const ABC = { clients: 'abc', contacts: 'abc', accounts: 'abc', transactions: 'abc' };

test('dry-runs and imports a fully prepared customer, completing onboarding', async ({ page, request }) => {
  const customer = await createCustomer(request, 'Import Customer');
  await mapSamples(request, customer.id, ABC);
  await activateTenant(request, customer.id);

  await openImport(page, customer.id);
  const readiness = page.getByRole('list', { name: 'Import readiness' });
  await expect(readiness).toContainText('4 of 4 data types saved');
  await expect(readiness).toContainText('Status: active');
  await expect(page.getByRole('button', { name: 'Import into tenant', exact: true })).toBeDisabled();

  await page.getByRole('button', { name: 'Run dry run', exact: true }).click();
  await expect(page.getByText('Ready to import. Nothing has been loaded yet.', { exact: true })).toBeVisible();
  const counts = page.getByLabel('Records to import', { exact: true });
  await expect(counts).toContainText('Chart of accounts39');
  await expect(counts).toContainText('Clients10');
  await expect(counts).toContainText('Contacts15');
  await expect(counts).toContainText('Transactions25');

  await page.getByRole('button', { name: 'Import into tenant', exact: true }).click();
  const result = page.getByTestId('import-result');
  await expect(result).toContainText('Import complete');
  await expect(result).toContainText('Imported 89 records');
  await expect(result).toContainText('fully set up (100%)');

  await page.getByRole('button', { name: 'Dashboard', exact: true }).click();
  const card = page.locator('.customer-card').filter({ has: page.getByRole('heading', { name: customer.name, exact: true }) });
  await expect(card).toContainText('100%');
  await expect(card.locator('li').filter({ hasText: 'Import' })).toContainText('completed');

  await page.reload();
  await openImport(page, customer.id);
  await expect(page.getByTestId('import-result')).toContainText('Last import');
  await expect(page.getByTestId('import-result')).toContainText('Imported 89 records');
});

test('shows blockers when Data Mapping is incomplete and the tenant is not active', async ({ page, request }) => {
  const customer = await createCustomer(request, 'Blocked Import');
  await mapSamples(request, customer.id, { clients: 'abc' });

  await openImport(page, customer.id);
  await expect(page.getByRole('list', { name: 'Import readiness' })).toContainText('1 of 4 data types saved');
  await page.getByRole('button', { name: 'Run dry run', exact: true }).click();
  const alert = page.getByRole('alert');
  await expect(alert).toContainText('Import is blocked');
  await expect(alert).toContainText('Still needed: Contacts, Chart of accounts, Transactions.');
  await expect(alert).toContainText(/Set up a tenant for this customer first\.|The tenant must be active before import/);
  await expect(page.getByRole('button', { name: 'Import into tenant', exact: true })).toBeDisabled();

  await page.getByRole('button', { name: 'Open Data Mapping', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Data Mapping', exact: true })).toBeVisible();
});

test('reports rows that fail cross-file checks and downloads them as CSV', async ({ page, request }) => {
  const customer = await createCustomer(request, 'Mismatched Import');
  // XYZ contacts reference XYZ client codes, which are not in the ABC clients file.
  await mapSamples(request, customer.id, { ...ABC, contacts: 'xyz' });
  await activateTenant(request, customer.id);

  await openImport(page, customer.id);
  await page.getByRole('button', { name: 'Run dry run', exact: true }).click();
  await expect(page.getByText('18 errors · 0 warnings', { exact: true })).toBeVisible();
  await expect(page.locator('.import-issues-table tbody tr').first()).toContainText('References client XYZ-001, which is not in the mapped clients.');
  await expect(page.getByRole('button', { name: 'Import into tenant', exact: true })).toBeDisabled();

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download failed-rows report', exact: true }).click();
  const report = fs.readFileSync(await (await downloadPromise).path(), 'utf8').trim().split('\n');
  expect(report[0]).toBe('datasetType,row,recordId,field,severity,message');
  expect(report).toHaveLength(19);
  expect(report[1]).toContain('contacts,1,CON-001,clientId,error,');
});
