const { test, expect } = require('@playwright/test');
const fs = require('node:fs');

test('repairs a sample, exports quoted CSV, saves mapping and restores it after refresh', async ({ page, request }) => {
  const created = await request.post('/api/customers', { data: { name: `CSV Customer ${Date.now()}`, contactEmail: 'cs@example.com' } });
  const { customer } = await created.json();
  await page.goto('/');
  await page.getByRole('button', { name: 'Data Mapping', exact: true }).click();
  await page.getByLabel('Customer', { exact: true }).selectOption(customer.id);
  await page.getByLabel('Sample data', { exact: true }).selectOption('xyz-clients');
  await page.getByRole('button', { name: 'Load sample', exact: true }).click();
  await expect(page.getByLabel('CSV content', { exact: true })).toContainText('Williams, Robert');
  await page.getByRole('button', { name: 'Analyze and preview', exact: true }).click();
  await expect(page.locator('.mapping-summary')).toContainText('0 proposed repairs');
  const path = require('node:path');
  const legacyCsv = fs.readFileSync(path.resolve(__dirname, '../../sample-data/CustomerB_XYZFinancialServices/clients.csv'), 'utf8')
    .replace(/"([^"\r\n]+,[^"\r\n]+)"(?=\r?$)/gm, '$1');
  await page.getByLabel('Upload CSV (up to 500 KB / 5,000 rows)', { exact: true }).setInputFiles({ name: 'legacy-xyz.csv', mimeType: 'text/csv', buffer: Buffer.from(legacyCsv) });
  await page.getByRole('button', { name: 'Analyze and preview', exact: true }).click();
  await expect(page.locator('.mapping-summary')).toContainText('12 proposed repairs');
  await expect(page.locator('.mapping-summary')).toContainText('0 errors');
  await expect(page.getByRole('button', { name: 'Save mapping for customer', exact: true })).toBeDisabled();
  await page.getByLabel('I reviewed and accept the proposed repairs.', { exact: true }).check();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download repaired CSV', exact: true }).click();
  const download = await downloadPromise;
  const downloadedCsv = fs.readFileSync(await download.path(), 'utf8');
  expect(downloadedCsv).toContain('"Williams, Robert"');
  await page.getByRole('button', { name: 'Save mapping for customer', exact: true }).click();
  await expect(page.getByText(/Data Mapping is complete. Onboarding progress: 50%/)).toBeVisible();
  await page.getByRole('button', { name: 'Dashboard', exact: true }).click();
  const card = page.locator('.customer-card').filter({ has: page.getByRole('heading', { name: customer.name, exact: true }) });
  await expect(card).toContainText('50%');
  await expect(card.locator('.step-status.completed')).toHaveCount(2);
  await page.reload();
  await page.getByRole('button', { name: 'Data Mapping', exact: true }).click();
  await page.getByLabel('Customer', { exact: true }).selectOption(customer.id);
  await expect(page.getByTestId('saved-mappings')).toContainText('12 rows');
  await page.getByRole('button', { name: 'Load saved file', exact: true }).click();
  await expect(page.getByLabel('CSV content', { exact: true })).toContainText('Williams, Robert');
});

test('blocks unknown malformed rows and supports manual column mapping', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Data Mapping', exact: true }).click();
  await page.getByLabel('CSV content', { exact: true }).fill('id,name\n1,Unexpected,extra\n');
  await page.getByRole('button', { name: 'Analyze and preview', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Expected 2 columns, found 3');
  await expect(page.getByRole('button', { name: 'Save mapping for customer', exact: true })).toBeDisabled();
  await page.getByLabel('CSV content', { exact: true }).fill('Code,Company\n001,Example\n');
  await page.getByRole('button', { name: 'Analyze and preview', exact: true }).click();
  await page.getByLabel('Source column for Client ID', { exact: true }).selectOption('Code');
  await page.getByLabel('Source column for Company name', { exact: true }).selectOption('Company');
  await expect(page.getByText('Settings changed. Analyze and preview again before saving or downloading.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Analyze and preview', exact: true }).click();
  await expect(page.locator('.mapping-summary')).toContainText('0 errors');
  await expect(page.locator('.mapped-preview')).toContainText('001');
  await expect(page.locator('.mapped-preview')).toContainText('Example');
});

test('reads an uploaded CSV and normalizes the sample dates', async ({ page }) => {
  const path = require('node:path');
  await page.goto('/');
  await page.getByRole('button', { name: 'Data Mapping', exact: true }).click();
  await page.getByLabel('Upload CSV (up to 500 KB / 5,000 rows)', { exact: true }).setInputFiles(path.resolve(__dirname, '../../sample-data/CustomerA_ABCAccounting/clients.csv'));
  await page.getByRole('button', { name: 'Analyze and preview', exact: true }).click();
  await expect(page.locator('.mapping-summary')).toContainText('10 dates normalized');
  await expect(page.locator('.mapped-preview')).toContainText('2023-01-15');
});
