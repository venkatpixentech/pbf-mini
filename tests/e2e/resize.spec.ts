// Pixi canvases resize in place: same canvas element, one canvas, and no resize listeners left behind.
import { test } from '@playwright/test';

import { dismissIntro, expect, GAMES, openGame } from './helpers';

type Counter = { __resizeListeners: number };

for (const game of GAMES.filter((g) => g.pixi)) {
  test(`${game.id}: resize keeps one canvas and does not leak listeners`, async ({ page }) => {
    await page.addInitScript(() => {
      // net window 'resize' listeners (Pixi's ResizePlugin adds one per Application)
      const w = window as unknown as Counter;
      w.__resizeListeners = 0;
      const add = window.addEventListener.bind(window) as (...a: unknown[]) => void;
      const remove = window.removeEventListener.bind(window) as (...a: unknown[]) => void;
      window.addEventListener = ((type: string, ...rest: unknown[]) => {
        if (type === 'resize') w.__resizeListeners++;
        return add(type, ...rest);
      }) as typeof window.addEventListener;
      window.removeEventListener = ((type: string, ...rest: unknown[]) => {
        if (type === 'resize') w.__resizeListeners--;
        return remove(type, ...rest);
      }) as typeof window.removeEventListener;
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await openGame(page, game.id);
    await dismissIntro(page);
    await page.evaluate(() => ((document.querySelector('canvas') as HTMLCanvasElement).dataset.probe = 'same'));
    const listeners = () => page.evaluate(() => (window as unknown as Counter).__resizeListeners);
    const before = await listeners();
    const sizes: Array<[number, number]> = [
      [844, 390],
      [320, 568],
      [430, 932],
      [390, 844],
      [320, 568],
      [390, 844],
    ];
    for (const [width, height] of sizes) {
      await page.setViewportSize({ width, height });
      await page.waitForTimeout(250);
      const state = await page.evaluate(() => {
        const canvases = document.querySelectorAll('canvas');
        const rect = canvases[0].getBoundingClientRect();
        return {
          count: canvases.length,
          same: canvases[0].dataset.probe === 'same',
          width: rect.width,
          buffer: canvases[0].width,
        };
      });
      expect(state.count, `canvases at ${width}x${height}`).toBe(1);
      expect(state.same, 'same canvas element (no re-initialisation)').toBe(true);
      expect(state.width, 'canvas fits the viewport').toBeLessThanOrEqual(width);
      expect(state.buffer, 'drawing buffer follows the canvas size').toBeGreaterThan(0);
    }
    expect(await listeners(), 'resize listeners after repeated resizes').toBe(before);
  });
}
