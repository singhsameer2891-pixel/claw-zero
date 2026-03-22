import { test, expect } from '@playwright/test';

test.describe('OpenClaw Canvas Dashboard', () => {
  const consoleErrors: string[] = [];

  test.beforeEach(async ({ page }) => {
    consoleErrors.length = 0;
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });
  });

  test('canvas page loads successfully', async ({ page }) => {
    const response = await page.goto('/__openclaw__/canvas/');

    // Page should return a successful HTTP status
    expect(response?.status()).toBeLessThan(400);

    // Page should have a non-empty title or body content
    await expect(page.locator('body')).not.toBeEmpty();
  });

  test('canvas page has no console errors', async ({ page }) => {
    await page.goto('/__openclaw__/canvas/');

    // Wait for any async scripts to settle
    await page.waitForLoadState('networkidle');

    expect(consoleErrors).toEqual([]);
  });

  test('canvas page responds to health check', async ({ page }) => {
    const response = await page.goto('/__openclaw__/canvas/');

    expect(response?.ok()).toBe(true);
    expect(response?.status()).toBe(200);
  });
});
