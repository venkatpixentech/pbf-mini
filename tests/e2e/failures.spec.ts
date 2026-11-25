// Failure states (docs/05-LOADING-PERFORMANCE.md): the player is never left stuck.
// Not covered: reconnect. No game has a socket or reconnect logic yet (docs/09-BACKEND-INTEGRATION.md).
import { test } from '@playwright/test';

import { dismissIntro, expect, openGame, pageText } from './helpers';

test('critical asset fails: "Unable to load" instead of a stuck loader (Higher or Lower)', async ({ page }) => {
  await page.route('**/higherlower/assets/higherlower/images/badges.json*', (route) => route.fulfill({ status: 500 }));
  await page.goto('/higherlower/');
  await expect(page.getByText('Unable to load').first()).toBeVisible({ timeout: 15_000 });
  expect(await page.locator('canvas').count()).toBe(0);
});

test('fonts fail: the game still becomes playable and interactive', async ({ page }) => {
  await page.route('**/*.woff2', (route) => route.fulfill({ status: 500 }));
  await openGame(page, 'higherlower');
  await dismissIntro(page);
  const before = await pageText(page);
  await page.locator('.hol-markets button:not([disabled])').first().click();
  await expect.poll(() => pageText(page)).not.toBe(before);
});

test('screen code fails: "Unable to load"', async ({ page }) => {
  await page.route('**/accacrash/assets/AccaCrashScreen-*.js', (route) => route.fulfill({ status: 500 }));
  await page.goto('/accacrash/');
  await expect(page.getByText('Unable to load').first()).toBeVisible({ timeout: 15_000 });
});

test('renderer chunk fails: the loader clears and the game UI is shown without a canvas', async ({ page }) => {
  await page.route('**/higherlower/assets/WebGLRenderer-*.js', (route) => route.fulfill({ status: 500 }));
  await page.goto('/higherlower/');
  await page.locator('.pbf-layout').waitFor({ timeout: 15_000 });
  await expect(page.locator('.boot-overlay')).toHaveCount(0, { timeout: 15_000 });
  expect(await page.locator('canvas').count()).toBe(0);
});

test('session error: the maintenance screen is shown and no canvas is created', async ({ page }) => {
  await page.goto('/higherlower/?mockInitError=MAINTENANCE');
  await expect(page.getByText('Under maintenance')).toBeVisible({ timeout: 15_000 });
  expect(await page.locator('canvas').count()).toBe(0);
});
