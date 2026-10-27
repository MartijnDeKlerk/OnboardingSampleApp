// @ts-check
const { test, expect } = require('@playwright/test');

test.describe('Onboarding Dashboard', () => {
  test('should display the dashboard heading', async ({ page }) => {
    await page.goto('/');

    // Verify the main heading is visible
    await expect(page.locator('h1')).toContainText('Onboarding Dashboard');
  });

  test('should show navigation tabs', async ({ page }) => {
    await page.goto('/');

    // Verify all navigation tabs are present
    await expect(page.locator('.tab')).toHaveCount(5);
    await expect(page.getByRole('button', { name: 'Dashboard' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Customer Info' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Data Mapping' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Tenant Setup' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Import' })).toBeVisible();
  });

  test('should display example customer in onboarding queue', async ({ page }) => {
    await page.goto('/');

    // Wait for data to load and verify example customer is shown
    await expect(page.getByRole('heading', { name: 'Acme Corporation', exact: true })).toBeVisible();
  });

  test('should switch between tabs', async ({ page }) => {
    await page.goto('/');

    // Click on Customer Info tab
    await page.getByRole('button', { name: 'Customer Info' }).click();
    
    await expect(page.getByRole('heading', { name: 'Customer Info', exact: true })).toBeVisible();
    await expect(page.getByLabel('Company name', { exact: true })).toBeVisible();
    await expect(page.getByLabel('Contact email', { exact: true })).toBeVisible();
  });
});

test('validates, saves, reloads and edits a new customer without duplicating it', async ({ page }) => {
  const name = `Workshop Customer ${Date.now()}`;
  await page.goto('/');
  await page.getByRole('button', { name: 'Customer Info', exact: true }).click();
  await page.getByRole('button', { name: 'Add customer', exact: true }).click();
  await page.getByRole('button', { name: 'Save customer info', exact: true }).click();
  await expect(page.getByText('Enter a company name.', { exact: true })).toBeVisible();
  await expect(page.getByText('Enter a valid contact email.', { exact: true })).toBeVisible();
  await page.getByLabel('Company name', { exact: true }).fill(name);
  await page.getByLabel('Contact email', { exact: true }).fill('invalid');
  await page.getByRole('button', { name: 'Save customer info', exact: true }).click();
  await expect(page.getByText('Enter a valid contact email.', { exact: true })).toBeVisible();
  await page.getByLabel('Contact email', { exact: true }).fill('cs@example.com');
  await page.getByRole('button', { name: 'Save customer info', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Onboarding progress: 25%');
  await page.getByRole('button', { name: 'Dashboard', exact: true }).click();
  const card = page.locator('.customer-card').filter({ has: page.getByRole('heading', { name, exact: true }) });
  await expect(card).toContainText('25%');
  await expect(card.locator('.step-status.completed')).toHaveCount(1);

  await page.reload();
  await expect(card).toBeVisible();
  await page.getByRole('button', { name: 'Customer Info', exact: true }).click();
  await page.getByLabel('Customer', { exact: true }).selectOption({ label: name });
  await expect(page.getByLabel('Contact email', { exact: true })).toHaveValue('cs@example.com');
  await page.getByLabel('Region (optional)', { exact: true }).fill('Europe');
  await page.getByRole('button', { name: 'Save customer info', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Onboarding progress: 25%');
  await page.getByRole('button', { name: 'Dashboard', exact: true }).click();
  await expect(card).toHaveCount(1);
  await expect(card).toContainText('Europe');
});

test('shows a readable error and retains entries if the server returns HTML', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Customer Info', exact: true }).click();
  await page.getByRole('button', { name: 'Add customer', exact: true }).click();
  await page.getByLabel('Company name', { exact: true }).fill('Unsaved Company');
  await page.getByLabel('Contact email', { exact: true }).fill('cs@example.com');
  await page.route('**/api/customers', route => route.request().method() === 'POST'
    ? route.fulfill({ status: 404, contentType: 'text/html', body: '<!DOCTYPE html><html>Not found</html>' })
    : route.continue());
  await page.getByRole('button', { name: 'Save customer info', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('The server could not save your changes.');
  await expect(page.getByLabel('Company name', { exact: true })).toHaveValue('Unsaved Company');
  await expect(page.getByLabel('Contact email', { exact: true })).toHaveValue('cs@example.com');
});
