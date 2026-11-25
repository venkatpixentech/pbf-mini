import { expect, type Page } from '@playwright/test';

export type GameId = 'higherlower' | 'accacrash' | 'lastmanstanding';

export const GAMES: Array<{ id: GameId; pixi: boolean }> = [
  { id: 'higherlower', pixi: true },
  { id: 'accacrash', pixi: true },
  { id: 'lastmanstanding', pixi: false },
];

/** Watches a page: failed requests, console errors/warnings and uncaught errors. */
export function watch(page: Page) {
  const failed: string[] = [];
  const messages: string[] = [];
  page.on('response', (r) => {
    if (r.status() >= 400) failed.push(`${r.status()} ${new URL(r.url()).pathname}`);
  });
  page.on('requestfailed', (r) => failed.push(`failed ${new URL(r.url()).pathname}`));
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') messages.push(`${m.type()}: ${m.text()}`);
  });
  page.on('pageerror', (e) => messages.push(`pageerror: ${e.message}`));
  return { failed, messages };
}

/** Opens a game from its subfolder and waits for the `pbf:playable` mark (overlay gone, first frame drawn). */
export async function openGame(page: Page, id: GameId, query = '') {
  await page.goto(`/${id}/${query}`);
  await page.locator('.pbf-layout').waitFor();
  await page.waitForFunction(() => performance.getEntriesByName('pbf:playable').length > 0, null, { timeout: 15_000 });
}

/** Closes the intro and tutorial dialogs a game shows on first run. */
export async function dismissIntro(page: Page) {
  for (let i = 0; i < 6; i++) {
    const button = page.locator('button', { hasText: /^(join game|play now|play|got it|next)$/i }).first();
    if (!(await button.isVisible().catch(() => false))) return;
    await button.click();
    await page.waitForTimeout(300);
  }
}

/** The button that starts a round or flow in each game. */
export function actionButton(page: Page, id: GameId) {
  if (id === 'lastmanstanding') return page.locator('button', { hasText: /^Start for/ });
  if (id === 'accacrash') return page.locator('.acca-panel .pbf-btn', { hasText: /^Bet/ }).first();
  return page.locator('.hol-markets button:not([disabled])').first();
}

export const pageText = (page: Page) => page.evaluate(() => document.body.innerText);

/** The lowest edge of the essential controls, and whether anything overflows sideways. */
export async function controlsBottom(page: Page) {
  return page.evaluate(() => {
    const els = [...document.querySelectorAll('.pbf-play-controls button, .pbf-play-controls .stake-chips')].filter(
      (e) => (e as HTMLElement).offsetParent,
    );
    const rects = els.map((e) => e.getBoundingClientRect());
    return {
      bottom: Math.max(...rects.map((r) => r.bottom)),
      right: Math.max(...rects.map((r) => r.right)),
      left: Math.min(...rects.map((r) => r.left)),
      count: els.length,
      width: innerWidth,
      height: innerHeight,
      overflowX: (document.querySelector('.pbf-layout') as HTMLElement).scrollWidth > innerWidth,
    };
  });
}

export { expect };
