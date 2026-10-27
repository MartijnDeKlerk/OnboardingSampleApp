// @ts-check
const { test, expect } = require('@playwright/test');

const SOURCES = [
  { id: 'CustomerA_ABCAccounting', label: 'ABC Accounting' },
  { id: 'CustomerB_XYZFinancialServices', label: 'XYZ Financial Services' },
  { id: 'CustomerC_PremierBookkeeping', label: 'Premier Bookkeeping' }
];

function profile(overrides) {
  return {
    clients: [],
    contacts: [],
    issues: [],
    ...overrides
  };
}

function abcProfile(name) {
  return profile({
    id: 'CustomerA_ABCAccounting',
    label: 'ABC Accounting',
    suggestedCustomer: { name, industry: 'Accounting', region: 'North America', contactEmail: '' },
    schemaStyle: 'Title Case',
    dateFormat: 'MM/DD/YYYY',
    currency: 'USD',
    counts: { clients: 10, contacts: 15, chartOfAccounts: 39, transactions: 25 }
  });
}

const XYZ_WARNINGS = Array.from({ length: 7 }, (_, index) => ({
  file: 'clients.csv',
  row: index + 1,
  field: 'primaryContact',
  severity: 'warning',
  message: 'Unquoted comma merged into last column'
}));

const XYZ_PROFILE = profile({
  id: 'CustomerB_XYZFinancialServices',
  label: 'XYZ Financial Services',
  suggestedCustomer: { name: 'XYZ Financial Services', industry: 'Financial Services', region: 'North America', contactEmail: '' },
  schemaStyle: 'camelCase',
  dateFormat: 'YYYY-MM-DD',
  currency: 'USD',
  counts: { clients: 12, contacts: 18, chartOfAccounts: 39, transactions: 25 },
  issues: [
    { file: 'transactions.csv', row: 4, field: 'amount', severity: 'error', message: 'Amount is not a number' },
    ...XYZ_WARNINGS
  ]
});

async function mockSampleData(page, profiles) {
  await page.route('**/api/sample-data**', route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/sample-data') return route.fulfill({ json: SOURCES });
    const match = path.match(/^\/api\/sample-data\/([^/]+)\/profile$/);
    const found = match && profiles[decodeURIComponent(match[1])];
    return found
      ? route.fulfill({ json: found })
      : route.fulfill({ status: 404, json: { error: 'Sample data source not found' } });
  });
}

async function openNewCustomerForm(page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Customer Info', exact: true }).click();
  await page.getByRole('button', { name: 'Add customer', exact: true }).click();
}

test('pre-fills a new customer from sample data, shows a summary, and saves', async ({ page }) => {
  const name = `ABC Accounting ${Date.now()}`;
  await mockSampleData(page, { CustomerA_ABCAccounting: abcProfile(name) });
  await openNewCustomerForm(page);

  await page.getByLabel('Pre-fill from sample data', { exact: true }).selectOption({ label: 'ABC Accounting' });
  await page.getByRole('button', { name: 'Load', exact: true }).click();

  await expect(page.getByLabel('Company name', { exact: true })).toHaveValue(name);
  await expect(page.getByLabel('Industry (optional)', { exact: true })).toHaveValue('Accounting');
  await expect(page.getByLabel('Region (optional)', { exact: true })).toHaveValue('North America');
  await expect(page.getByLabel('Contact email', { exact: true })).toHaveValue('');
  await expect(page.getByRole('status')).toContainText('Pre-filled Company name, Industry, Region from ABC Accounting.');

  const summary = page.getByRole('region', { name: 'Sample data summary: ABC Accounting' });
  await expect(summary).toBeVisible();
  await expect(summary).toContainText('Title Case');
  await expect(summary).toContainText('MM/DD/YYYY');
  await expect(summary).toContainText('USD');
  const counts = summary.getByRole('definition');
  await expect(counts).toContainText(['Title Case', 'MM/DD/YYYY', 'USD', '10', '15', '39', '25']);
  await expect(summary.getByText('No data issues found', { exact: true })).toBeVisible();

  // Nothing is saved until the existing save flow runs.
  await page.getByLabel('Contact email', { exact: true }).fill('cs@abc-accounting.example');
  await page.getByRole('button', { name: 'Save customer info', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Onboarding progress: 25%');
  await page.getByRole('button', { name: 'Dashboard', exact: true }).click();
  const card = page.locator('.customer-card').filter({ has: page.getByRole('heading', { name, exact: true }) });
  await expect(card).toContainText('25%');
  await expect(card).toContainText('North America');
});

test('keeps values the user typed and lists issues with collapse', async ({ page }) => {
  await mockSampleData(page, { CustomerB_XYZFinancialServices: XYZ_PROFILE });
  await openNewCustomerForm(page);
  await page.getByLabel('Company name', { exact: true }).fill('My Typed Company');
  await page.getByLabel('Contact email', { exact: true }).fill('typed@example.com');

  await page.getByLabel('Pre-fill from sample data', { exact: true }).selectOption({ label: 'XYZ Financial Services' });
  await page.getByRole('button', { name: 'Load', exact: true }).click();

  await expect(page.getByLabel('Company name', { exact: true })).toHaveValue('My Typed Company');
  await expect(page.getByLabel('Contact email', { exact: true })).toHaveValue('typed@example.com');
  await expect(page.getByLabel('Industry (optional)', { exact: true })).toHaveValue('Financial Services');
  await expect(page.getByLabel('Region (optional)', { exact: true })).toHaveValue('North America');
  const notice = page.getByRole('status');
  await expect(notice).toContainText('Pre-filled Industry, Region from XYZ Financial Services.');
  await expect(notice).toContainText('Left unchanged because they already had different values: Company name.');

  const summary = page.getByRole('region', { name: 'Sample data summary: XYZ Financial Services' });
  await expect(summary).toContainText('camelCase');
  await expect(summary).toContainText('YYYY-MM-DD');
  await expect(summary).toContainText('1 error, 7 warnings');
  const issues = summary.getByRole('listitem');
  await expect(issues).toHaveCount(5);
  await expect(issues.first()).toContainText('Error');
  await expect(issues.first()).toContainText('transactions.csv, row 4, field amount: Amount is not a number');
  await expect(issues.nth(1)).toContainText('Warning');
  await expect(issues.nth(1)).toContainText('clients.csv, row 1, field primaryContact: Unquoted comma merged into last column');

  const toggle = summary.getByRole('button', { name: 'Show 3 more issues', exact: true });
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await toggle.click();
  await expect(issues).toHaveCount(8);
  await expect(summary.getByRole('button', { name: 'Show fewer issues', exact: true })).toHaveAttribute('aria-expanded', 'true');
});

for (const [description, fulfill] of [
  ['returns a server error', { status: 500, contentType: 'text/html', body: '<!DOCTYPE html><html>Error</html>' }],
  ['returns an empty list', { json: [] }]
]) {
  test(`keeps the manual form usable when the sample data list ${description}`, async ({ page }) => {
    await page.route('**/api/sample-data**', route => route.fulfill(fulfill));
    await openNewCustomerForm(page);

    await expect(page.getByLabel('Company name', { exact: true })).toBeVisible();
    await expect(page.getByLabel('Pre-fill from sample data', { exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Load', exact: true })).toHaveCount(0);
    await expect(page.getByRole('alert')).toHaveCount(0);

    await page.getByLabel('Company name', { exact: true }).fill(`Manual Customer ${Date.now()}`);
    await page.getByLabel('Contact email', { exact: true }).fill('manual@example.com');
    await page.getByRole('button', { name: 'Save customer info', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('Onboarding progress: 25%');
  });
}

test('shows a readable alert when a sample data profile is not found', async ({ page }) => {
  await mockSampleData(page, {});
  await openNewCustomerForm(page);
  await page.getByLabel('Company name', { exact: true }).fill('Still Here Ltd');

  await page.getByLabel('Pre-fill from sample data', { exact: true }).selectOption({ label: 'Premier Bookkeeping' });
  await page.getByRole('button', { name: 'Load', exact: true }).click();

  await expect(page.getByRole('alert')).toContainText('Could not load sample data: Sample data source not found');
  await expect(page.getByLabel('Company name', { exact: true })).toHaveValue('Still Here Ltd');
  await expect(page.getByLabel('Industry (optional)', { exact: true })).toHaveValue('');
  await expect(page.locator('.sample-summary')).toHaveCount(0);
});

test('shows a readable alert when the profile response is not JSON', async ({ page }) => {
  await page.route('**/api/sample-data**', route => {
    const path = new URL(route.request().url()).pathname;
    return path === '/api/sample-data'
      ? route.fulfill({ json: SOURCES })
      : route.fulfill({ status: 502, contentType: 'text/html', body: '<!DOCTYPE html><html>Bad gateway</html>' });
  });
  await openNewCustomerForm(page);
  await page.getByRole('button', { name: 'Load', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('The server could not load this sample data. Please try again.');
});
