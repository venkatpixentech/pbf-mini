// Translations (docs/08-I18N-TRANSLATIONS.md): language from the launch parameter, English fallback, live switching
// without a reload, React text and Pixi text from the same source. The test language is the pseudo-language `xx`
// (generated from English, text in square brackets); no real translation exists yet.
import { test } from '@playwright/test';

import { dismissIntro, expect, openGame, watch } from './helpers';

/** Captures every Pixi Application through Pixi's own init hook, so tests can read canvas text. */
const captureApps = () => {
  (window as unknown as { __apps: unknown[] }).__apps = [];
  (globalThis as unknown as { __PIXI_APP_INIT__: (app: unknown) => void }).__PIXI_APP_INIT__ = (app) =>
    (window as unknown as { __apps: unknown[] }).__apps.push(app);
};

/** All text drawn on the first Pixi stage. */
const canvasTexts = (page: import('@playwright/test').Page) =>
  page.evaluate(() => {
    type Node = { children?: Node[]; text?: unknown };
    const app = (window as unknown as { __apps: Array<{ stage: Node }> }).__apps[0];
    const out: string[] = [];
    const walk = (n: Node) => {
      if (typeof n.text === 'string') out.push(n.text);
      n.children?.forEach(walk);
    };
    walk(app.stage);
    return out;
  });

const balanceLabel = (page: import('@playwright/test').Page) =>
  page.locator('.pbf-balance small').first().textContent();

test('English by default; unsupported languages fall back to English', async ({ page }) => {
  await openGame(page, 'higherlower');
  expect(await balanceLabel(page)).toBe('Balance');
  const german = await page.context().newPage();
  const seen = watch(german);
  await openGame(german, 'higherlower', '?lang=de');
  expect(await balanceLabel(german)).toBe('Balance');
  expect(await german.evaluate(() => document.documentElement.lang)).toBe('en');
  expect(seen.messages).toEqual([]);
});

test('the language launch parameter selects the language (React text), including the boot screens', async ({
  page,
}) => {
  await openGame(page, 'higherlower', '?lang=xx');
  expect(await balanceLabel(page)).toMatch(/^\[.*\]$/);
  await dismissIntro(page);
  expect(await page.locator('.hol-banner h2').textContent()).toMatch(/\[Hígh.*\]/);
  const maintenance = await page.context().newPage();
  await maintenance.goto('/higherlower/?lang=xx&mockInitError=MAINTENANCE');
  await expect(maintenance.getByText(/^\[Úñdér máíñtéñáñçé/)).toBeVisible({ timeout: 15_000 });
});

test('switching the language live needs no reload and also relabels Pixi text (Higher or Lower)', async ({ page }) => {
  await page.addInitScript(captureApps);
  await openGame(page, 'higherlower');
  await dismissIntro(page);
  await page.evaluate(() => ((window as unknown as { __same: number }).__same = 1));
  expect(await balanceLabel(page)).toBe('Balance');
  expect((await canvasTexts(page)).some((t) => t.startsWith('['))).toBe(false);

  await page.evaluate(() => (location.hash = '#?lang=xx'));
  await expect.poll(() => balanceLabel(page)).toMatch(/^\[.*\]$/);
  expect(await page.evaluate(() => (window as unknown as { __same: number }).__same), 'no reload').toBe(1);
  expect(
    (await canvasTexts(page)).some((t) => t.startsWith('[')),
    'card tier text relabelled in Pixi',
  ).toBe(true);

  await page.evaluate(() => (location.hash = '#?lang=en'));
  await expect.poll(() => balanceLabel(page)).toBe('Balance');
  expect((await canvasTexts(page)).some((t) => t.startsWith('['))).toBe(false);
});

test('Acca Crash curve labels follow a live language switch (Pixi text from the game dictionary)', async ({ page }) => {
  await page.addInitScript(captureApps);
  await openGame(page, 'accacrash');
  await dismissIntro(page);
  await expect
    .poll(async () => (await canvasTexts(page)).some((t) => t.includes('CASH OUT BEFORE IT CRASHES')))
    .toBe(true);
  await page.evaluate(() => (location.hash = '#?lang=xx'));
  await expect
    .poll(async () => (await canvasTexts(page)).some((t) => t.startsWith('[') && t.includes('ÇÁSH')), { timeout: 5000 })
    .toBe(true);
});
