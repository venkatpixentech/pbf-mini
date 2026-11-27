// Assets, display wrappers and layout in a real browser, through the display harness (npm run build:harness, then
// npm run test:e2e): bundle loading and release, shared assets across stages, failed loads and retry, sequences, scene sizing
// across viewports, text fitting and the animated sprite. Docs: docs/PBF-PIXI-CAPABILITY-MATRIX.md.
import { type Page, test } from '@playwright/test';

import { expect, watch } from './helpers';

const HARNESS = '/displayharness/';
/** Browser messages that are not problems: Chrome warns about GPU read-backs, which the harness uses to count pixels. */
const real = (messages: string[]) => messages.filter((m) => !/GPU stall|ReadPixels/.test(m));

const open = async (page: Page, query = '') => {
  await page.goto(`${HARNESS}${query}`);
  await page.getByTestId('mount-A').waitFor();
};
const mount = async (page: Page, id: string) => {
  await page.getByTestId(`mount-${id}`).click();
  await page.waitForFunction((i) => !!(window as any).__display.stages[i], id, { timeout: 20_000 });
};
const stats = (page: Page) => page.evaluate(() => (window as any).__display.stats());
const painted = (page: Page, id: string) =>
  page.evaluate((i) => (window as any).__display.stages[i].painted() as number, id);
const draws = (page: Page, id: string) =>
  expect.poll(() => painted(page, id), { timeout: 15_000 }).toBeGreaterThan(500);
const display = <T>(page: Page, expression: string) => page.evaluate(`window.__display.${expression}`) as Promise<T>;
const fontLoaded = (page: Page) =>
  page.evaluate(() => [...document.fonts].some((f) => f.family === 'ProbeFont' && f.status === 'loaded'));

test.describe('Display harness', () => {
  test('assets load and draw; the last release frees them; a fresh mount draws again', async ({ page }) => {
    const seen = watch(page);
    await open(page);
    await mount(page, 'A');
    expect(await stats(page)).toMatchObject({
      badges: { refs: 1, loaded: true },
      digits: { refs: 1, loaded: true },
      probeFont: { refs: 1, loaded: true },
    });
    await draws(page, 'A');
    expect(await display(page, 'texture("goldBadge")'), 'an atlas frame is usable').toBe(true);
    expect(await display(page, 'bitmapInstalled("degularblackbmp")'), 'the bitmap font is installed').toBe(true);
    expect(await fontLoaded(page), 'the canvas font is registered').toBe(true);

    await page.getByTestId('unmount-A').click();
    await expect.poll(async () => (await stats(page)).badges).toEqual({ refs: 0, loaded: false });
    expect(await display(page, 'hasAlias("badges")')).toBe(false);
    expect(await display(page, 'hasAlias("goldBadge")'), 'atlas frames are gone').toBe(false);
    expect(await display(page, 'bitmapInstalled("degularblackbmp")'), 'the bitmap font is uninstalled').toBe(false);
    expect(await fontLoaded(page), 'the canvas font is removed').toBe(false);

    await mount(page, 'A');
    await draws(page, 'A');
    expect(await display(page, 'errors')).toEqual([]);
    expect(seen.failed).toEqual([]);
    expect(real(seen.messages)).toEqual([]);
  });

  test('two stages share every file; releasing one leaves the other drawing', async ({ page }) => {
    const requested: string[] = [];
    page.on('request', (r) => requested.push(decodeURIComponent(new URL(r.url()).pathname)));
    await open(page);
    await mount(page, 'A');
    await mount(page, 'B');
    expect((await stats(page)).badges.refs).toBe(2);
    for (const file of ['badges.json', 'badges.png', 'digits.fnt', 'Probe.woff2'])
      expect(
        requested.filter((u) => u.endsWith(file)),
        `${file} requested once`,
      ).toHaveLength(1);
    await draws(page, 'A');
    await draws(page, 'B');

    await page.getByTestId('unmount-A').click();
    await expect.poll(async () => (await stats(page)).badges.refs).toBe(1);
    expect(await display(page, 'hasAlias("badges")')).toBe(true);
    expect(await fontLoaded(page)).toBe(true);
    await draws(page, 'B');

    await page.getByTestId('unmount-B').click();
    await expect.poll(async () => (await stats(page)).badges).toEqual({ refs: 0, loaded: false });
    expect(await display(page, 'hasAlias("badges")')).toBe(false);
  });

  test('bundles that overlap on an alias release independently', async ({ page }) => {
    await open(page);
    await page.evaluate(() => (window as any).__display.acquireBundles('x', ['cards']));
    await page.evaluate(() => (window as any).__display.acquireBundles('y', ['fonts']));
    expect(await stats(page)).toMatchObject({
      badges: { refs: 2, loaded: true },
      digits: { refs: 1, loaded: true },
      probeFont: { refs: 1, loaded: true },
    });
    await page.evaluate(() => (window as any).__display.release('x'));
    await expect.poll(async () => (await stats(page)).digits).toEqual({ refs: 0, loaded: false });
    expect((await stats(page)).badges).toEqual({ refs: 1, loaded: true });
    expect(await display(page, 'hasAlias("badges")'), 'the shared atlas stays').toBe(true);
    expect(await fontLoaded(page)).toBe(true);
    await page.evaluate(() => (window as any).__display.release('y'));
    await expect.poll(async () => (await stats(page)).badges).toEqual({ refs: 0, loaded: false });
    expect(await fontLoaded(page)).toBe(false);

    const message = await page.evaluate(async () => {
      try {
        await (window as any).__display.acquireBundles('z', ['nope']);
        return '';
      } catch (e) {
        return (e as Error).message;
      }
    });
    expect(message).toMatch(/Unknown asset bundle "nope".*cards, fonts/);
  });

  test('a sequence becomes one load per sheet and follows the asset resolution', async ({ page }) => {
    const requested: string[] = [];
    page.on('request', (r) => requested.push(decodeURIComponent(new URL(r.url()).pathname)));
    await open(page);
    expect((await display<any>(page, 'device()')).assetResolution, 'desktop loads full size').toBe('@1x');
    await mount(page, 'S');
    expect(Object.keys(await stats(page)).sort()).toEqual(['seq0', 'seq1']);
    expect(requested.filter((u) => /images\/@1x\/seq[01]\.json$/.test(u))).toHaveLength(2);
    await draws(page, 'S');
    await page.getByTestId('unmount-S').click();
    await expect.poll(async () => (await stats(page)).seq0).toEqual({ refs: 0, loaded: false });
  });

  test('a file that fails is retried once, the stage reports it, and nothing stays held', async ({ page }) => {
    const requested: string[] = [];
    page.on('request', (r) => requested.push(new URL(r.url()).pathname));
    await open(page);
    await mount(page, 'P'); // a stage that loads nothing is unaffected
    await page.getByTestId('mount-X').click(); // one asset that does not exist (404)
    await expect.poll(() => display<string[]>(page, 'errors')).toEqual(['X: assets']);
    expect(
      requested.filter((u) => u.endsWith('missing.png')),
      'one try and one retry',
    ).toHaveLength(2);
    expect((await stats(page)).missing.refs, 'the stage still holds its reference until it unmounts').toBe(1);
    await page.getByTestId('unmount-X').click();
    await expect.poll(async () => (await stats(page)).missing).toEqual({ refs: 0, loaded: false });
    expect(await display(page, 'hasAlias("missing")')).toBe(false);
    await draws(page, 'P'); // the other stage kept working
  });

  test('a transient failure succeeds on the retry, and a later mount after a hard failure draws', async ({ page }) => {
    const requested: string[] = [];
    page.on('request', (r) => requested.push(new URL(r.url()).pathname));
    await open(page);
    let failures = 1;
    await page.route('**/displayprobe/images/@1x/badges.json*', (route) =>
      failures-- > 0 ? route.fulfill({ status: 500 }) : route.continue(),
    );
    await mount(page, 'A');
    expect(
      requested.filter((u) => u.endsWith('badges.json')),
      'the failed try and the retry',
    ).toHaveLength(2);
    await draws(page, 'A');
    expect(await display(page, 'errors')).toEqual([]);
    await page.getByTestId('unmount-A').click();
    await expect.poll(async () => (await stats(page)).badges).toEqual({ refs: 0, loaded: false });

    // a hard failure (both tries) fails the stage; once the network is back, a fresh mount works
    failures = 2;
    await page.getByTestId('mount-B').click(); // never becomes ready
    await expect.poll(() => display<string[]>(page, 'errors')).toEqual(['B: assets']);
    await page.getByTestId('unmount-B').click();
    await expect.poll(async () => (await stats(page)).badges).toEqual({ refs: 0, loaded: false });
    failures = 0;
    await mount(page, 'A');
    await draws(page, 'A');
  });

  test('the scene stays centred and inside the canvas across viewports, resizes and rotation', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await open(page, '?full=1');
    await mount(page, 'A');
    await draws(page, 'A');
    await page.evaluate(() => ((window as any).__canvas = document.querySelector('canvas')));
    const viewports = [
      [202, 356],
      [202, 275],
      [224, 237],
      [360, 640],
      [390, 844],
      [768, 1024],
      [1280, 720],
      [1920, 1080],
      [844, 390], // phone rotated
      [356, 202],
    ] as const;
    for (const [w, h] of viewports) {
      await page.setViewportSize({ width: w, height: h });
      await expect.poll(() => page.evaluate(() => (window as any).__display.stages.A.layouts.at(-1)?.width)).toBe(w);
      const r = await page.evaluate(() => {
        const c = (window as any).__display.stages.A;
        const b = c.root.getBounds();
        return {
          screen: { w: c.app.screen.width, h: c.app.screen.height },
          x: b.x,
          y: b.y,
          right: b.x + b.width,
          bottom: b.y + b.height,
          scale: c.root.scale.x,
          sameCanvas: document.querySelector('canvas') === (window as any).__canvas,
          canvases: document.querySelectorAll('canvas').length,
        };
      });
      const label = `${w}x${h}`;
      expect(r.sameCanvas, `${label}: the canvas is not re-created`).toBe(true);
      expect(r.canvases).toBe(1);
      expect(r.x, `${label} left`).toBeGreaterThanOrEqual(-1);
      expect(r.y, `${label} top`).toBeGreaterThanOrEqual(-1);
      expect(r.right, `${label} right`).toBeLessThanOrEqual(r.screen.w + 1);
      expect(r.bottom, `${label} bottom`).toBeLessThanOrEqual(r.screen.h + 1);
      expect(Math.abs(r.scale - Math.min(r.screen.w / 720, r.screen.h / 960)), `${label} scale`).toBeLessThan(1e-3);
      expect(Math.abs(r.x - (r.screen.w - r.right)), `${label} horizontally centred`).toBeLessThan(2);
      expect(Math.abs(r.y - (r.screen.h - r.bottom)), `${label} vertically centred`).toBeLessThan(2);
    }
    await draws(page, 'A'); // still drawing at the smallest size
  });

  test('text shrinks to its width and line count, and the animated sprite plays, repeats and reverses', async ({
    page,
  }) => {
    await open(page);
    await mount(page, 'A');
    const text = await page.evaluate(() => {
      const d = (window as any).__display;
      const root = d.stages.A.root;
      const caption = root.getChildByLabel('caption', true);
      const wrapped = root.getChildByLabel('wrapped', true);
      return {
        captionWidth: caption.width,
        captionSize: caption.style.fontSize,
        wrappedLines: d.lineCount(wrapped),
        wrappedSize: wrapped.style.fontSize,
      };
    });
    expect(text.captionWidth).toBeLessThanOrEqual(560);
    expect(text.captionSize, 'the caption shrank from 60').toBeLessThan(60);
    expect(text.wrappedLines).toBeLessThanOrEqual(2);
    expect(text.wrappedSize, 'the wrapped text shrank from 50').toBeLessThan(50);

    const names = await page.evaluate(() => {
      const u = (window as any).__display.UIUtil;
      return {
        plain: u.getAnimationFramesArray({ prefix: 'f', postfix: '.png', start: 8, end: 11 }),
        reverse: u.getAnimationFramesArray({ prefix: 'f', postfix: '.png', start: 0, end: 3, playReverse: true }),
        every: u.getAnimationFramesArray({ prefix: 'f', postfix: '.png', start: 0, end: 5, skipFrame: true }),
        wide: u.getAnimationFramesArray({ prefix: 'f', postfix: '', start: 99, end: 101, checkPoint: 100 }),
      };
    });
    expect(names.plain).toEqual(['f08.png', 'f09.png', 'f10.png', 'f11.png']);
    expect(names.reverse).toEqual(['f02.png', 'f01.png', 'f00.png']);
    expect(names.every).toEqual(['f00.png', 'f02.png', 'f04.png']);
    expect(names.wide, 'three digits below the checkpoint of 100').toEqual(['f099', 'f100', 'f101']);

    const anim = await page.evaluate(async () => {
      const d = (window as any).__display;
      const frames = ['bronzeBadge', 'silverBadge', 'goldBadge'].map((n) => d.Texture.from(n));
      const run = async (reverse: boolean) => {
        const sprite = new d.PixAnimatedSprite(frames, { animationSpeed: 0.5 });
        d.stages.A.app.stage.addChild(sprite);
        let completed = 0;
        sprite.on('REPEAT_ANIMATION_COMPLETED', () => completed++);
        if (reverse) sprite.playReverseAnimation();
        else sprite.playAnimation({ loop: false, repeat: 2 });
        const t0 = performance.now();
        while (!completed && performance.now() - t0 < 8000) await new Promise((r) => setTimeout(r, 20));
        const out = { completed, frame: sprite.currentFrame, ms: performance.now() - t0 };
        sprite.destroy();
        return out;
      };
      return { forward: await run(false), reverse: await run(true) };
    });
    expect(anim.forward.completed, 'forward finishes after two repeats').toBe(1);
    expect(anim.reverse.completed, 'reverse finishes').toBe(1);
    expect(anim.reverse.frame, 'reverse ends on the first frame').toBe(0);
    expect(real((await display<string[]>(page, 'errors')).map(String))).toEqual([]);
  });
});
