const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');

const XYZ_CLIENTS = path.resolve(__dirname, '../../sample-data/CustomerB_XYZFinancialServices/clients.csv');

async function openTab(page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Data Mapping', exact: true }).click();
}

test('shows a loaded sample as a table and lets the user edit the raw CSV', async ({ page }) => {
  await openTab(page);
  await page.getByLabel('Sample data', { exact: true }).selectOption('xyz-clients');
  await page.getByRole('button', { name: 'Load sample', exact: true }).click();

  const table = page.getByTestId('csv-table');
  await expect(table).toBeVisible();
  await expect(page.getByLabel('CSV content', { exact: true })).toBeHidden();
  await expect(page.getByRole('button', { name: 'Table', exact: true })).toHaveAttribute('aria-pressed', 'true');
  const headers = await table.locator('thead th .csv-header').allTextContents();
  expect(headers).toEqual(['clientCode', 'companyName', 'entityType', 'clientStatus', 'startDate', 'federalTaxId', 'yearlyRevenue', 'sectorCode', 'billingTerms', 'mainContact']);
  await expect(table.locator('tbody tr')).toHaveCount(12);
  await expect(page.locator('.csv-table-meta')).toContainText('clients.csv · 12 rows · 10 columns');
  // The quoted "Surname, First" contact stays one cell.
  await expect(table.locator('tbody tr').first().locator('td').last()).toHaveText('Williams, Robert');
  await expect(table.locator('tbody tr').first().locator('td').nth(6)).toHaveClass(/csv-numeric/);

  await page.getByRole('button', { name: 'Analyze and preview', exact: true }).click();
  await expect(page.locator('.mapping-summary')).toContainText('0 errors');
  await expect(table.locator('thead th').nth(1)).toContainText('→ Client ID');

  await page.getByRole('button', { name: 'Edit raw CSV', exact: true }).click();
  const raw = page.getByLabel('CSV content', { exact: true });
  await expect(raw).toBeVisible();
  await expect(raw).toBeFocused();
  await raw.fill('Code,Company,Notes\n001,Example,"Line ""one"", two"\r\n002,Other,\r\n');
  await expect(page.getByText('Settings changed. Analyze and preview again before saving or downloading.', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save mapping for customer', exact: true })).toBeDisabled();

  await page.getByRole('button', { name: 'Table', exact: true }).click();
  await expect(table.locator('tbody tr')).toHaveCount(2);
  await expect(table.locator('tbody tr').first().locator('td').last()).toHaveText('Line "one", two');
  // Results belong to the previous CSV, so the headers carry no mapping yet.
  await expect(table.locator('.csv-target')).toHaveCount(0);
});

test('after analysis, headers show target fields and repaired rows are highlighted', async ({ page }) => {
  const legacyCsv = fs.readFileSync(XYZ_CLIENTS, 'utf8').replace(/"([^"\r\n]+,[^"\r\n]+)"(?=\r?$)/gm, '$1');
  await openTab(page);
  await page.getByLabel('Upload CSV (up to 500 KB / 5,000 rows)', { exact: true }).setInputFiles({ name: 'legacy-xyz.csv', mimeType: 'text/csv', buffer: Buffer.from(legacyCsv) });
  const table = page.getByTestId('csv-table');
  await expect(table.locator('tbody tr')).toHaveCount(12);
  await page.getByRole('button', { name: 'Analyze and preview', exact: true }).click();
  await expect(page.locator('.mapping-summary')).toContainText('12 proposed repairs');

  const header = table.locator('thead th');
  await expect(header.nth(1)).toContainText('clientCode');
  await expect(header.nth(1)).toContainText('→ Client ID');
  await expect(header.nth(4)).toContainText('→ Status');
  await expect(header.nth(10)).toContainText('mainContact');
  await expect(header.nth(10)).toContainText('→ Primary contact');

  const row = table.locator('tbody tr[data-line="2"]');
  await expect(row).toHaveClass(/csv-row-repair/);
  await expect(row).toHaveAttribute('title', /Proposed repair: Join the surname and first name/);
  await expect(row.locator('.csv-flag')).toHaveText('Repair');
  // Picklist values show the target they import as.
  await expect(row.locator('td').nth(3)).toContainText('A');
  await expect(row.locator('td').nth(3).locator('.value-tag')).toHaveText('→ Active');
});

test('flags rows referenced by errors and caps large files at 50 rows', async ({ page }) => {
  const rows = Array.from({ length: 60 }, (_, index) => `${String(index + 1).padStart(3, '0')},Company ${index + 1}`);
  rows[54] = '055,Broken,extra';
  await openTab(page);
  await page.getByLabel('CSV content', { exact: true }).fill(`Code,Company\n${rows.join('\n')}\n`);
  await page.getByRole('button', { name: 'Table', exact: true }).click();
  const table = page.getByTestId('csv-table');
  await expect(table.locator('tbody tr')).toHaveCount(50);
  await expect(page.locator('.csv-table-footer')).toContainText('Showing 50 of 60 rows');
  await page.getByRole('button', { name: 'Show all', exact: true }).click();
  await expect(table.locator('tbody tr')).toHaveCount(60);

  await page.getByRole('button', { name: 'Analyze and preview', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Line 56: Expected 2 columns, found 3');
  const broken = table.locator('tbody tr[data-line="56"]');
  await expect(broken).toHaveClass(/csv-row-error/);
  await expect(broken).toHaveAttribute('title', /Expected 2 columns, found 3/);
  await expect(broken.locator('td.csv-extra')).toHaveText('extra');
  await page.getByLabel(/Only rows with issues/).check();
  await expect(table.locator('tbody tr')).toHaveCount(1);
});
