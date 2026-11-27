// Spine in a real browser, through the Spine harness (npm run build:harness, then npm run test:e2e):
// lazy loading, rendering with real PBF Spine assets, playback (forward, reverse, mix, queue, events), skins, slots,
// fit, sharing between stages, release, unmount during loading, pause and resume, and that the Pixi and Spine
// code never reaches Last Man Standing (DOM) or the other games. Docs: docs/PBF-PIXI-CAPABILITY-MATRIX.md.
import { type Page, test } from '@playwright/test';

import { expect, openGame, watch } from './helpers';

const HARNESS = '/spineharness/';
const SPINE_CODE = /SkeletonJson|SkeletonBinary/; // spine-core classes: only in the Spine runtime chunk
const PIXI_CODE = /PixiJS|pixijs\.com/;
const probe = (page: Page, body: string) => page.evaluate(`(async () => { const P = window.__probe; ${body} })()`);

/** Scripts a page loads, with their text, so a test can tell which chunks contain Spine or Pixi code. */
function watchScripts(page: Page) {
  const pending: Array<Promise<{ url: string; text: string }>> = [];
  page.on('response', (r) => {
    if (/\.js(\?|$)/.test(r.url())) pending.push(r.text().then((text) => ({ url: r.url(), text })));
  });
  return {
    /** Paths of every script loaded so far whose text matches. */
    async withCode(pattern: RegExp) {
      const all = await Promise.all(pending.map((p) => p.catch(() => ({ url: 'http://x/', text: '' }))));
      return all.filter((s) => pattern.test(s.text)).map((s) => new URL(s.url).pathname);
    },
  };
}

/** Browser messages that are not problems: Chrome warns about GPU read-backs, which the harness uses to count pixels. */
const real = (messages: string[]) => messages.filter((m) => !/GPU stall|ReadPixels/.test(m));

async function open(page: Page) {
  await page.goto(HARNESS);
  await page.getByTestId('mount-A').waitFor();
}
async function mount(page: Page, id: string) {
  await page.getByTestId(`mount-${id}`).click();
  await page.waitForFunction((i) => !!(window as any).__probe.stages[i], id, { timeout: 20_000 });
}
const stats = (page: Page) => page.evaluate(() => (window as any).__probe.stats());
const painted = (page: Page, id: string) =>
  page.evaluate((i) => (window as any).__probe.stages[i].painted() as number, id);
const trackTime = (page: Page, id: string) =>
  page.evaluate(
    (i) => (window as any).__probe.stages[i].instances.get('main').spineAnim.state.getCurrent(0).trackTime as number,
    id,
  );

test.describe('Spine harness', () => {
  test('the Spine runtime loads only when a stage uses Spine', async ({ page }) => {
    const seen = watch(page);
    const scripts = watchScripts(page);
    await open(page);
    await page.waitForLoadState('networkidle');
    expect(await scripts.withCode(SPINE_CODE), 'Spine code on the first load').toEqual([]);
    expect(await scripts.withCode(PIXI_CODE), 'Pixi is part of the harness page').not.toEqual([]);

    await mount(page, 'P'); // a Pixi stage without Spine
    expect(await scripts.withCode(SPINE_CODE), 'Spine code after a stage without Spine').toEqual([]);
    expect(await stats(page)).toEqual({});

    await mount(page, 'A'); // a stage with a Spine asset
    expect(await scripts.withCode(SPINE_CODE), 'the Spine runtime chunk').toHaveLength(1);
    expect((await stats(page)).goldPack).toEqual({ refs: 1, loaded: true });
    expect(await page.evaluate(() => (window as any).__probe.errors)).toEqual([]);
    expect(seen.failed).toEqual([]);
    expect(real(seen.messages)).toEqual([]);
  });

  test('draws the real asset and fits it to the box', async ({ page }) => {
    await open(page);
    await mount(page, 'A');
    await expect.poll(() => painted(page, 'A'), { timeout: 15_000 }).toBeGreaterThan(500);
    // place() with fit scales the current pose into the 280 x 280 box (contain: the larger side fills it)
    const size = (await probe(
      page,
      `const s = P.stages.A.instances.get('main');
       s.place({ x: 160, y: 160, fit: { width: 280, height: 280, mode: 'contain' } });
       const b = s.getBounds(); return { w: b.width, h: b.height };`,
    )) as { w: number; h: number };
    expect(Math.max(size.w, size.h)).toBeGreaterThan(270);
    expect(Math.max(size.w, size.h)).toBeLessThan(281);
    expect(Math.min(size.w, size.h)).toBeLessThan(281);
  });

  test('forward and reverse playback, events, mix, queue and unsubscribe (binary skeleton)', async ({ page }) => {
    const seen = watch(page);
    await open(page);
    await mount(page, 'F');
    const result = (await probe(
      page,
      `const s = P.stages.F.instances.get('main');
       const names = s.spineAnim.skeleton.data.animations.map((a) => a.name);
       const run = async (name, reverse) => {
         const log = { events: [], complete: 0 };
         const offE = s.listen('event', (i) => log.events.push(i.name));
         const offC = s.listen('complete', () => log.complete++);
         const t0 = performance.now();
         s.play(name, { reverse, timeScale: 8 });
         while (!log.complete && performance.now() - t0 < 15000) await new Promise((r) => setTimeout(r, 20));
         offE(); offC();
         return log;
       };
       const out = { names, forward: {}, reverse: {} };
       for (const n of names) { out.forward[n] = await run(n, false); out.reverse[n] = await run(n, true); }
       return out;`,
    )) as { names: string[]; forward: Record<string, any>; reverse: Record<string, any> };
    expect(result.names.sort()).toEqual(['backfxAnimation', 'frontfxAnimation', 'loopAnimation']);
    for (const n of result.names) {
      expect(result.forward[n].complete, `${n} forward completes`).toBe(1);
      expect(result.reverse[n].complete, `${n} reverse completes`).toBe(1);
      expect(result.reverse[n].events, `${n} reverse fires no animation events`).toEqual([]);
    }
    const withEvents = result.names.filter((n) => result.forward[n].events.length > 0);
    expect(withEvents.length, 'at least one animation fires events going forward').toBeGreaterThan(0);

    const mix = (await probe(
      page,
      `const s = P.stages.F.instances.get('main');
       // Spine applies a pose at render time and skips an animation that was never applied, so let frames pass
       // between plays; and read each entry at once, the runtime reuses finished entries.
       const frames = (n) => new Promise((done) => { let i = 0; const f = () => (++i >= n ? done() : requestAnimationFrame(f)); requestAnimationFrame(f); });
       s.play('backfxAnimation'); await frames(3);
       const toFront = s.play('frontfxAnimation');            // pair in the view mixes: 0.5 s
       const pair = toFront.mixDuration;
       const fromBack = toFront.mixingFrom && toFront.mixingFrom.animation.name;
       await frames(3);
       const toBack = s.play('backfxAnimation');              // no pair: the view's defaultMix (0)
       const none = toBack.mixDuration;
       await frames(3);
       const override = s.play('loopAnimation', { mix: 0.25 }).mixDuration;
       return { pair, fromBack, none, override };`,
    )) as { pair: number; fromBack: string; none: number; override: number };
    expect(mix).toEqual({ pair: 0.5, fromBack: 'backfxAnimation', none: 0, override: 0.25 });

    const queue = (await probe(
      page,
      `const s = P.stages.F.instances.get('main');
       const started = [];
       const off = s.listen('start', (i) => started.push(i.animation));
       s.play('backfxAnimation', { timeScale: 8 });
       const next = s.play('frontfxAnimation', { queue: true, timeScale: 8 });
       const queued = s.spineAnim.state.getCurrent(0).next === next;
       const t0 = performance.now();
       while (started.length < 2 && performance.now() - t0 < 15000) await new Promise((r) => setTimeout(r, 20));
       off();
       return { queued, started };`,
    )) as { queued: boolean; started: string[] };
    expect(queue).toEqual({ queued: true, started: ['backfxAnimation', 'frontfxAnimation'] });

    // an unsubscribed listener is silent, and destroying an instance leaves no listener on its state
    const gone = (await probe(
      page,
      `const c = P.stages.F;
       const s = await c.spawn('tmp', 'fx');
       let calls = 0;
       const off = s.listen('start', () => calls++);
       s.play('backfxAnimation'); const afterPlay = calls;
       off(); s.play('frontfxAnimation'); const afterOff = calls;
       const state = s.spineAnim.state;
       s.listen('start', () => calls++);
       c.drop('tmp');
       return { afterPlay, afterOff, listeners: state.listeners.length, destroyed: s.destroyed };`,
    )) as { afterPlay: number; afterOff: number; listeners: number; destroyed: boolean };
    expect(gone).toEqual({ afterPlay: 1, afterOff: 1, listeners: 0, destroyed: true });
    expect(await page.evaluate(() => (window as any).__probe.errors)).toEqual([]);
    expect(seen.failed).toEqual([]);
    expect(real(seen.messages)).toEqual([]);
  });

  test('skins, slots and errors (JSON skeleton)', async ({ page }) => {
    await open(page);
    await mount(page, 'A');
    const r = (await probe(
      page,
      `const s = P.stages.A.instances.get('main');
       s.setSkin('Silver Pack'); s.setSkin(['default', 'Gold Pack']);
       let skinError = ''; try { s.setSkin('Nope'); } catch (e) { skinError = e.message; }
       let animError = ''; try { s.play('nope'); } catch (e) { animError = e.message; }
       const slot = s.spineAnim.skeleton.slots[0].data.name;
       const holder = P.newContainer();
       s.attach(slot, holder);
       const attached = s.spineAnim.getSlotObject(slot) === holder;
       s.detach(holder);
       const detached = !s.spineAnim._slotsObject[slot];   // the runtime sets the entry to null
       return { skinError, animError, attached, detached };`,
    )) as Record<string, any>;
    expect(r.skinError).toMatch(/"Nope".*Gold Pack/);
    expect(r.animError).toMatch(/"nope".*packAnimation/);
    expect(r.attached && r.detached).toBe(true);
    await expect.poll(() => painted(page, 'A'), { timeout: 15_000 }).toBeGreaterThan(500);
  });

  test('two stages share the atlas; tearing one down leaves the other drawing; the last release frees it', async ({
    page,
  }) => {
    const seen = watch(page);
    const requested: string[] = [];
    page.on('request', (r) => requested.push(decodeURIComponent(new URL(r.url()).pathname)));
    await open(page);
    const sharedTicker = await page.evaluate(() => (window as any).__probe.sharedTickerCount());

    await mount(page, 'A');
    await mount(page, 'B');
    expect(await stats(page)).toEqual({ goldPack: { refs: 2, loaded: true } });
    expect(
      requested.filter((u) => u.endsWith('Pack Open.json')),
      'one skeleton request for two stages',
    ).toHaveLength(1);
    expect(await page.evaluate(() => (window as any).__probe.sharedTickerCount()), 'nothing on Ticker.shared').toBe(
      sharedTicker,
    );
    const pages = await page.evaluate(() => (window as any).__probe.capturePages('goldPackAtlas'));
    expect(pages).toBeGreaterThan(0);
    await expect.poll(() => painted(page, 'A'), { timeout: 15_000 }).toBeGreaterThan(500);
    await expect.poll(() => painted(page, 'B'), { timeout: 15_000 }).toBeGreaterThan(500);
    await page.evaluate(() => {
      const p = (window as any).__probe;
      p.kept = p.stages.B.instances.get('main').spineAnim.state;
    });

    // tear one stage down: the other keeps drawing and animating, and the asset stays loaded
    await page.getByTestId('unmount-A').click();
    await expect.poll(async () => (await stats(page)).goldPack.refs).toBe(1);
    expect(await page.evaluate(() => (window as any).__probe.hasAlias('goldPackAtlas'))).toBe(true);
    expect(await page.evaluate(() => (window as any).__probe.pagesDestroyed())).toEqual(Array(pages).fill(false));
    await expect.poll(() => painted(page, 'B'), { timeout: 15_000 }).toBeGreaterThan(500);
    const t1 = await trackTime(page, 'B');
    await page.waitForTimeout(300);
    expect(await trackTime(page, 'B'), 'B keeps animating').toBeGreaterThan(t1);

    // tear down the last one: everything is released
    await page.getByTestId('unmount-B').click();
    await expect.poll(async () => (await stats(page)).goldPack).toEqual({ refs: 0, loaded: false });
    const gone = await page.evaluate(() => {
      const p = (window as any).__probe;
      return {
        data: p.hasAlias('goldPackData'),
        atlas: p.hasAlias('goldPackAtlas'),
        pages: p.pagesDestroyed(),
        listeners: p.kept.listeners.length,
        shared: p.sharedTickerCount(),
      };
    });
    expect(gone).toEqual({
      data: false,
      atlas: false,
      pages: Array(pages).fill(true),
      listeners: 0,
      shared: sharedTicker,
    });

    // a later mount loads again from scratch and draws
    await mount(page, 'A');
    await expect.poll(() => painted(page, 'A'), { timeout: 15_000 }).toBeGreaterThan(500);
    expect(
      requested.filter((u) => u.endsWith('Pack Open.json')),
      'second load after the release',
    ).toHaveLength(2);
    expect(await page.evaluate(() => (window as any).__probe.errors)).toEqual([]);
    expect(seen.failed).toEqual([]);
    expect(real(seen.messages)).toEqual([]);
  });

  test('two Spine assets with different skeletons and one atlas: either can close and the other still draws', async ({
    page,
  }) => {
    const seen = watch(page);
    const requested: string[] = [];
    page.on('request', (r) => requested.push(decodeURIComponent(new URL(r.url()).pathname)));
    await open(page);
    const draws = (id: string) => expect.poll(() => painted(page, id), { timeout: 15_000 }).toBeGreaterThan(500);
    const probeValue = <T>(fn: string) => page.evaluate(`window.__probe.${fn}`) as Promise<T>;

    for (const closeFirst of ['A', 'C']) {
      const other = closeFirst === 'A' ? 'C' : 'A';
      await mount(page, 'A'); // goldPack (JSON skeleton)
      await mount(page, 'C'); // goldPackBin (binary skeleton), same atlas file
      expect(await stats(page)).toEqual({
        goldPack: { refs: 1, loaded: true },
        goldPackBin: { refs: 1, loaded: true },
      });
      expect(requested.filter((u) => u.endsWith('Pack Open.atlas')).length, 'the atlas is fetched once per round').toBe(
        closeFirst === 'A' ? 1 : 2,
      );
      await probeValue('capturePages("goldPackAtlas")');
      await draws('A');
      await draws('C');

      await page.getByTestId(`unmount-${closeFirst}`).click();
      await expect.poll(async () => (await stats(page))[closeFirst === 'A' ? 'goldPack' : 'goldPackBin'].refs).toBe(0);
      await draws(other); // the other keeps drawing from the shared atlas
      expect(await probeValue('pagesDestroyed()'), 'shared atlas pages are still alive').toEqual([false]);
      expect(
        (await probeValue('hasAlias("goldPackAtlas")')) || (await probeValue('hasAlias("goldPackBinAtlas")')),
      ).toBe(true);

      await page.getByTestId(`unmount-${other}`).click();
      await expect.poll(async () => (await stats(page)).goldPack.refs + (await stats(page)).goldPackBin.refs).toBe(0);
      await expect.poll(() => probeValue('pagesDestroyed()')).toEqual([true]);
      for (const alias of ['goldPackData', 'goldPackAtlas', 'goldPackBinData', 'goldPackBinAtlas'])
        expect(await probeValue(`hasAlias("${alias}")`), alias).toBe(false);
    }
    // after everything is released, a fresh mount of either asset draws again
    await mount(page, 'C');
    await draws('C');
    expect(await probeValue('errors')).toEqual([]);
    expect(seen.failed).toEqual([]);
    expect(real(seen.messages)).toEqual([]);
  });

  test('unmounting while the assets are still loading releases them without errors', async ({ page }) => {
    const seen = watch(page);
    await open(page);
    await page.route('**/spineprobe/**', async (route) => {
      await new Promise((r) => setTimeout(r, 1200)); // keep the load in flight
      await route.continue();
    });
    await page.getByTestId('mount-A').click();
    await expect.poll(async () => (await stats(page)).goldPack?.refs).toBe(1);
    await page.getByTestId('unmount-A').click(); // the stage is torn down mid-load
    await expect
      .poll(async () => (await stats(page)).goldPack, { timeout: 20_000 })
      .toEqual({ refs: 0, loaded: false });
    expect(await page.evaluate(() => (window as any).__probe.hasAlias('goldPackAtlas'))).toBe(false);
    expect(await page.evaluate(() => (window as any).__probe.errors)).toEqual([]);

    await page.unroute('**/spineprobe/**');
    await mount(page, 'A'); // and the asset is usable again afterwards
    await expect.poll(() => painted(page, 'A'), { timeout: 15_000 }).toBeGreaterThan(500);
    expect(seen.failed).toEqual([]);
    expect(real(seen.messages)).toEqual([]);
  });

  test('a paused stage and a hidden tab stop the animation, and resuming does not jump', async ({ page }) => {
    await open(page);
    await mount(page, 'A');
    const advance = async (ms: number) => {
      const before = await trackTime(page, 'A');
      await page.waitForTimeout(ms);
      return (await trackTime(page, 'A')) - before;
    };
    expect(await advance(300), 'running').toBeGreaterThan(0.15);

    await page.getByTestId('pause-A').click();
    await page.waitForTimeout(100);
    expect(await advance(400), 'paused').toBe(0);
    await page.getByTestId('resume-A').click();
    const resumed = await advance(500);
    expect(resumed, 'resumed').toBeGreaterThan(0.2);
    expect(resumed, 'no catch-up jump after the pause').toBeLessThan(0.9);

    const setHidden = (hidden: boolean) =>
      page.evaluate((h) => {
        Object.defineProperty(document, 'hidden', { configurable: true, get: () => h });
        document.dispatchEvent(new Event('visibilitychange'));
      }, hidden);
    await setHidden(true);
    await page.waitForTimeout(100);
    expect(await advance(400), 'tab hidden').toBe(0);
    await setHidden(false);
    const back = await advance(500);
    expect(back).toBeGreaterThan(0.2);
    expect(back).toBeLessThan(0.9);
  });
});

test.describe('licence notice', () => {
  // The minifier strips licence comments, and the Spine Runtimes License needs its notice to travel with the code.
  for (const [path, shipsSpine] of [
    ['spineharness', true],
    ['higherlower', true],
    ['accacrash', true],
    ['lastmanstanding', false],
  ] as const) {
    test(`${path}: ${shipsSpine ? 'ships the Spine notice' : 'has no notice (no Spine code)'}`, async ({ request }) => {
      const response = await request.get(`/${path}/THIRD-PARTY-NOTICES.txt`);
      if (shipsSpine) {
        expect(response.status()).toBe(200);
        expect(await response.text()).toContain('Spine Runtimes License Agreement');
      } else expect(response.status()).toBe(404);
    });
  }
});

test.describe('the games never load Spine', () => {
  for (const [id, pixi] of [
    ['lastmanstanding', false],
    ['higherlower', true],
    ['accacrash', true],
  ] as const) {
    test(`${id} requests no Spine code${pixi ? '' : ' and no Pixi'}`, async ({ page }) => {
      const requested: string[] = [];
      page.on('request', (r) => requested.push(r.url()));
      const scripts = watchScripts(page);
      await openGame(page, id);
      await page.waitForLoadState('networkidle');
      expect(await scripts.withCode(SPINE_CODE), 'scripts with Spine code').toEqual([]);
      if (!pixi) {
        expect(await scripts.withCode(PIXI_CODE), 'scripts with Pixi code').toEqual([]);
        expect(requested.filter((u) => /pixi|spine/i.test(new URL(u).pathname))).toEqual([]);
      }
    });
  }
});
