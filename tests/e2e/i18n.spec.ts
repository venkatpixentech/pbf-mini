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

// The pseudo-language `xx` is a development tool: a production build (what these tests run against) must
// ignore it, from the query string and from the hash, at launch and live. Its behaviour (React and Pixi text,
// live switching) is covered in development by the dev-server check and by i18n.check.ts.
test('the pseudo test language cannot be activated in a production build (query, hash, live switch)', async ({
  page,
}) => {
  await page.addInitScript(captureApps);
  await openGame(page, 'higherlower', '?lang=xx');
  expect(await balanceLabel(page)).toBe('Balance');
  expect(await page.evaluate(() => document.documentElement.lang)).toBe('en');
  await dismissIntro(page);
  expect(await page.locator('.hol-banner h2').textContent()).not.toMatch(/^\[/);

  // hash launch parameter, as PBF passes it: #/home?lang=xx
  const hashed = await page.context().newPage();
  await hashed.addInitScript(captureApps);
  await openGame(hashed, 'higherlower', '#/home?lang=xx');
  expect(await balanceLabel(hashed)).toBe('Balance');

  // live switch on the running page
  await page.evaluate(() => (location.hash = '#?lang=xx'));
  await page.waitForTimeout(500);
  expect(await balanceLabel(page)).toBe('Balance');
  expect((await canvasTexts(page)).some((t) => t.startsWith('['))).toBe(false);

  const maintenance = await page.context().newPage();
  await maintenance.goto('/higherlower/?lang=xx&mockInitError=MAINTENANCE');
  await expect(maintenance.getByText(/^Under maintenance/i)).toBeVisible({ timeout: 15_000 });
});
