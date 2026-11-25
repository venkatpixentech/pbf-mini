// Every game: loads from a subfolder, becomes playable with no failed requests or console messages, and a click
// changes the game state (interactive, not just rendered).
import { test } from '@playwright/test';

import { actionButton, dismissIntro, expect, GAMES, openGame, pageText, watch } from './helpers';

for (const game of GAMES) {
  test.describe(game.id, () => {
    test('loads from a subfolder and is playable with a clean console', async ({ page }) => {
      const seen = watch(page);
      await openGame(page, game.id);
      expect(seen.failed, 'failed requests').toEqual([]);
      expect(seen.messages, 'console and page errors').toEqual([]);
      const canvases = await page.locator('canvas').count();
      expect(canvases, 'canvases (Pixi games draw exactly one, DOM games none)').toBe(game.pixi ? 1 : 0);
      const marks = await page.evaluate(() => performance.getEntriesByType('mark').map((m) => m.name));
      expect(marks).toContain('pbf:playable');
      expect(marks.includes('pbf:renderer'), 'Pixi stage created only for Pixi games').toBe(game.pixi);
    });

    test('a click changes the game state', async ({ page }) => {
      await openGame(page, game.id);
      await dismissIntro(page);
      const before = await pageText(page);
      await actionButton(page, game.id).click();
      await expect.poll(() => pageText(page), { timeout: 5000 }).not.toBe(before);
    });
  });
}
