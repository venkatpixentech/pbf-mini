// Failure states (docs/05-LOADING-PERFORMANCE.md): the player is never left stuck.
// Not covered: reconnect. No game has a socket or reconnect logic yet (docs/09-BACKEND-INTEGRATION.md).
import { test } from '@playwright/test';

import { dismissIntro, expect, GAMES, openGame, pageText } from './helpers';

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

// A currency code Intl cannot format (?currency=COINS reaches the mock session) makes the screen throw while
// rendering. Before the error boundary this unmounted everything and left a blank page.
for (const game of GAMES) {
  test(`${game.id}: a screen that crashes while rendering shows the runtime error screen, and Reload works`, async ({
    page,
  }) => {
    await page.goto(`/${game.id}/?currency=COINS`);
    await expect(page.getByText('Something went wrong')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('The game stopped unexpectedly. Please reload the game.')).toBeVisible();
    await expect(page.locator('.boot-overlay')).toHaveCount(0);
    expect(await page.locator('.pbf-layout').count()).toBe(0);
    const reloaded = page.waitForEvent('load');
    await page.getByRole('button', { name: 'Reload' }).click();
    await reloaded;
    await expect(page.getByText('Something went wrong')).toBeVisible({ timeout: 15_000 });
  });
}

test('WebGL context lost then restored: the canvas redraws and the display error clears (Higher or Lower)', async ({
  page,
}) => {
  await openGame(page, 'higherlower');
  await dismissIntro(page);
  const canvas = page.locator('canvas').first();
  await canvas.evaluate((c: HTMLCanvasElement) => {
    const gl = c.getContext('webgl2') ?? c.getContext('webgl');
    const ext = gl?.getExtension('WEBGL_lose_context');
    (window as unknown as { __lose: WEBGL_lose_context | null | undefined }).__lose = ext;
    ext?.loseContext();
  });
  await expect(page.getByText('Display error (context-lost)')).toBeVisible({ timeout: 5_000 });
  await page.evaluate(() => (window as unknown as { __lose: WEBGL_lose_context }).__lose.restoreContext());
  await expect(page.getByText('Display error (context-lost)')).toHaveCount(0, { timeout: 5_000 });
  expect(await page.locator('canvas').count()).toBe(1);
});
