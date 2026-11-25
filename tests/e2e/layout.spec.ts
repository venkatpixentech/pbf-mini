// Layout (docs/06-RESPONSIVE-GAME-LAYOUT.md): essential controls inside the viewport, no horizontal overflow,
// portrait, landscape and constrained embeds.
import { test } from '@playwright/test';

import { controlsBottom, dismissIntro, expect, GAMES, openGame } from './helpers';

const SIZES = [
  { name: '390x844', width: 390, height: 844, maxShare: 0.55 },
  { name: '360x800', width: 360, height: 800, maxShare: 0.56 },
  { name: '320x568', width: 320, height: 568, maxShare: 1 },
  { name: 'landscape 844x390', width: 844, height: 390, maxShare: 1 },
  { name: 'embed 360x420', width: 360, height: 420, maxShare: 1 },
];

for (const game of GAMES) {
  for (const size of SIZES) {
    test(`${game.id} at ${size.name}`, async ({ browser }) => {
      const context = await browser.newContext({
        viewport: { width: size.width, height: size.height },
        isMobile: true,
        hasTouch: true,
      });
      const page = await context.newPage();
      await openGame(page, game.id);
      await dismissIntro(page);
      const c = await controlsBottom(page);
      expect(c.count, 'essential controls found').toBeGreaterThan(0);
      expect(c.bottom, 'controls end inside the viewport').toBeLessThanOrEqual(c.height);
      expect(c.bottom / c.height, 'controls end within the allowed share of the height').toBeLessThanOrEqual(
        size.maxShare,
      );
      expect(c.right, 'no control clipped on the right').toBeLessThanOrEqual(c.width + 1);
      expect(c.left).toBeGreaterThanOrEqual(-1);
      expect(c.overflowX, 'no horizontal overflow').toBe(false);
      await context.close();
    });
  }
}

test('operator element: --pbf-host-height keeps every game inside its box', async ({ browser }) => {
  for (const game of GAMES) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
    const page = await context.newPage();
    await page.addInitScript(() =>
      document.addEventListener('DOMContentLoaded', () =>
        document.documentElement.style.setProperty('--pbf-host-height', '420px'),
      ),
    );
    await openGame(page, game.id);
    await dismissIntro(page);
    const frame = await page.locator('.app-frame').boundingBox();
    expect(frame!.height, `${game.id} frame height`).toBeCloseTo(420, 0);
    const c = await controlsBottom(page);
    expect(c.bottom, `${game.id} controls inside the 420 px box`).toBeLessThanOrEqual(420);
    await context.close();
  }
});
