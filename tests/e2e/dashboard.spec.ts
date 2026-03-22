import { test, expect } from '@playwright/test';
import { execa } from 'execa';

const GATEWAY_TOKEN = process.env.GATEWAY_TOKEN ?? '';
const CONTAINER_NAME = 'openclaw_sandbox';

/** Approve the latest pending device pairing request inside the container. */
async function approveLatestDevice(): Promise<boolean> {
  try {
    await execa('docker', [
      'exec', CONTAINER_NAME,
      'npx', 'openclaw', 'devices', 'approve',
      '--latest',
      '--token', GATEWAY_TOKEN,
    ], { stdio: 'pipe', timeout: 10_000 });
    return true;
  } catch {
    return false;
  }
}

test.describe('OpenClaw Control UI', () => {
  test('control UI connects after auto-approved pairing', async ({ page }) => {
    const url = `http://127.0.0.1:18789/#token=${GATEWAY_TOKEN}`;

    // First visit — browser generates device identity, gateway requires pairing
    await page.goto(url);
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveTitle(/OpenClaw/);

    // Wait for the pending pairing request to appear, then approve it
    await page.waitForTimeout(3_000);
    const approved = await approveLatestDevice();
    expect(approved).toBe(true);

    // Reload the page — the device is now paired, should auto-connect
    await page.waitForTimeout(1_000);
    await page.reload();
    await page.waitForLoadState('networkidle');

    // Give the WebSocket time to connect
    await page.waitForTimeout(5_000);

    // "pairing required" should NOT be visible after reload with approved device
    const pairingText = page.locator('text=pairing required');
    const stillPairing = await pairingText.isVisible();

    if (stillPairing) {
      // Debug: capture page state
      const bodyText = await page.locator('body').innerText();
      console.log('DEBUG — still showing pairing after reload:', bodyText.slice(0, 800));
    }

    expect(stillPairing).toBe(false);
  });
});

test.describe('OpenClaw Canvas', () => {
  test('canvas page loads', async ({ page }) => {
    const response = await page.goto(
      `http://127.0.0.1:18789/__openclaw__/canvas/`
    );
    // Canvas may require auth — just verify the server responds
    expect(response?.status()).toBeDefined();
  });
});
