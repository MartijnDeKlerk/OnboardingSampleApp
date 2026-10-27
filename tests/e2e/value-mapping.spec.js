const { test, expect } = require('@playwright/test');

// The value-mapping backend is developed separately, so preview and save
// responses are mocked here to follow the agreed API contract.
const CSV = 'Code,Company,Status\n001,Example,ACTIVE\n002,Other,DORMANT\n003,Third,DORMANT\n004,Fourth,WEIRD\n';
const STATUS_TARGETS = ['Active', 'Inactive', 'Pending'];
const SUGGESTED = { ACTIVE: 'Active', DORMANT: 'Inactive', WEIRD: null };
const ROWS = [['001', 'Example', 'ACTIVE'], ['002', 'Other', 'DORMANT'], ['003', 'Third', 'DORMANT'], ['004', 'Fourth', 'WEIRD']];

function analysis(body, { withValueMappings = true } = {}) {
  const overrides = body.valueMapping?.status || {};
  const resolve = source => overrides[source] ?? SUGGESTED[source];
  const values = Object.keys(SUGGESTED).map(source => ({
    source, count: ROWS.filter(row => row[2] === source).length, suggested: SUGGESTED[source], target: resolve(source)
  }));
  const errors = withValueMappings
    ? values.filter(value => value.target == null).map(value => ({ line: null, message: `Map every value for Status: "${value.source}"` }))
    : [];
  const preview = ROWS.map(([id, name, status]) => ({ id, name, status: withValueMappings ? (resolve(status) ?? '') : status }));
  return {
    totalRows: ROWS.length, repairs: [], errors, normalizedDates: 0, unmappedHeaders: [],
    headers: ['Code', 'Company', 'Status'], mapping: { id: 'Code', name: 'Company', status: 'Status' },
    detectedSource: 'Mocked source', dateFormat: 'YMD', preview,
    correctedCsv: CSV,
    mappedCsv: errors.length ? null : `id,name,status\n${preview.map(row => `${row.id},${row.name},${row.status}`).join('\n')}\n`,
    ...(withValueMappings ? { valueMappings: [{ field: 'status', label: 'Status', targets: STATUS_TARGETS, values }] } : {})
  };
}

async function mockPreview(page, options) {
  const bodies = [];
  await page.route('**/api/mapping/preview', async route => {
    const body = route.request().postDataJSON();
    bodies.push(body);
    await route.fulfill({ json: analysis(body, options) });
  });
  return bodies;
}

async function openTab(page, customerId) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Data Mapping', exact: true }).click();
  if (customerId) await page.getByLabel('Customer', { exact: true }).selectOption(customerId);
  await page.getByLabel('Data type', { exact: true }).selectOption('clients');
  await page.getByLabel('CSV content', { exact: true }).fill(CSV);
}

test('shows suggested value mappings, blocks unmapped values and saves overrides', async ({ page, request }) => {
  const created = await request.post('/api/customers', { data: { name: `Value Map Customer ${Date.now()}`, contactEmail: 'vm@example.com' } });
  const { customer } = await created.json();
  const previews = await mockPreview(page);
  const saves = [];
  await page.route('**/api/customers/*/mappings', async route => {
    if (route.request().method() !== 'POST') return route.continue();
    const body = route.request().postDataJSON();
    saves.push(body);
    await route.fulfill({ json: {
      mapping: { datasetType: 'clients', fileName: body.fileName, totalRows: ROWS.length, repairs: [], columnMapping: body.mapping, valueMapping: { status: { ACTIVE: 'Active', DORMANT: 'Inactive', WEIRD: 'Pending' } }, originalCsv: body.csv, dateFormat: body.dateFormat },
      onboarding: { progressPercent: 50 }
    } });
  });

  await openTab(page, customer.id);
  await page.getByRole('button', { name: 'Analyze and preview', exact: true }).click();
  expect(previews[0].valueMapping).toBeUndefined();

  const section = page.getByTestId('value-mapping');
  await expect(section.getByRole('heading', { name: 'Value mapping', exact: true })).toBeVisible();
  const dormant = page.getByLabel('Target for Status "DORMANT"', { exact: true });
  await expect(dormant).toHaveValue('Inactive');
  const dormantRow = section.getByRole('row').filter({ has: dormant });
  await expect(dormantRow).toContainText('2');
  await expect(dormantRow).toContainText('Suggested');

  const weird = page.getByLabel('Target for Status "WEIRD"', { exact: true });
  await expect(weird).toHaveValue('');
  const weirdRow = section.getByRole('row').filter({ has: weird });
  await expect(weirdRow).toHaveClass(/value-unmapped/);
  await expect(weirdRow).toContainText('Unmapped');
  await expect(page.getByRole('alert')).toContainText('Map every value for Status: "WEIRD"');
  await expect(page.getByRole('button', { name: 'Save mapping for customer', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Download mapped CSV', exact: true })).toBeDisabled();

  await weird.selectOption('Pending');
  await expect(weirdRow).not.toHaveClass(/value-unmapped/);
  await expect(weirdRow).toContainText('Overridden');
  await expect(page.getByText('Settings changed. Analyze and preview again before saving or downloading.', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save mapping for customer', exact: true })).toBeDisabled();

  await page.getByRole('button', { name: 'Analyze and preview', exact: true }).click();
  expect(previews[1].valueMapping).toEqual({ status: { WEIRD: 'Pending' } });
  await expect(page.locator('.mapping-summary')).toContainText('0 errors');
  await expect(page.locator('.mapped-preview')).toContainText('Pending');

  await page.getByRole('button', { name: 'Save mapping for customer', exact: true }).click();
  await expect(page.getByText(/Data Mapping is complete. Onboarding progress: 50%/)).toBeVisible();
  expect(saves[0].valueMapping).toEqual({ status: { WEIRD: 'Pending' } });

  // A saved mapping restores its resolved value mapping.
  await page.getByLabel('CSV content', { exact: true }).fill(CSV);
  await page.getByRole('button', { name: 'Load saved file', exact: true }).click();
  await page.getByRole('button', { name: 'Analyze and preview', exact: true }).click();
  expect(previews[2].valueMapping).toEqual({ status: { ACTIVE: 'Active', DORMANT: 'Inactive', WEIRD: 'Pending' } });
  await expect(page.getByLabel('Target for Status "WEIRD"', { exact: true })).toHaveValue('Pending');
});

test('changing the data type or CSV resets value overrides', async ({ page }) => {
  const previews = await mockPreview(page);
  await openTab(page);
  await page.getByRole('button', { name: 'Analyze and preview', exact: true }).click();
  await page.getByLabel('Target for Status "DORMANT"', { exact: true }).selectOption('Pending');
  await page.getByLabel('CSV content', { exact: true }).fill(`${CSV}005,Fifth,ACTIVE\n`);
  await page.getByRole('button', { name: 'Analyze and preview', exact: true }).click();
  expect(previews[1].valueMapping).toBeUndefined();

  await page.getByLabel('Target for Status "DORMANT"', { exact: true }).selectOption('Pending');
  await page.getByLabel('Data type', { exact: true }).selectOption('contacts');
  await page.getByLabel('Data type', { exact: true }).selectOption('clients');
  await page.getByRole('button', { name: 'Analyze and preview', exact: true }).click();
  expect(previews[2].valueMapping).toBeUndefined();
});

test('hides value mapping when the backend does not return valueMappings', async ({ page }) => {
  const previews = await mockPreview(page, { withValueMappings: false });
  await openTab(page);
  await page.getByRole('button', { name: 'Analyze and preview', exact: true }).click();
  await expect(page.locator('.mapping-summary')).toContainText('0 errors');
  await expect(page.locator('.mapped-preview')).toContainText('DORMANT');
  await expect(page.getByTestId('value-mapping')).toHaveCount(0);
  await expect(page.getByText('Status and category values are preserved.', { exact: false })).toBeVisible();
  expect(previews[0].valueMapping).toBeUndefined();
});
