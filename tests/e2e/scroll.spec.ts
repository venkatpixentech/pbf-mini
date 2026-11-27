// Scroll strips, remote sprites and the FPS meter inside a Pixi scene, in a real browser (display harness stages R and D,
// npm run build:harness then npm run test:e2e): wheel, mouse and touch drags, tap versus drag (a drag that passes the tap threshold
// belongs to the strip, so a scroll can never also select a card), a press on a coasting strip, clipping, limits, pause, cleanup;
// remote images (cross-origin, failure, one request per URL, URL change or destroy while loading); the dev-only FPS meter.
// Docs: docs/PBF-PIXI-CAPABILITY-MATRIX.md.
import { type CDPSession, type Page, test } from '@playwright/test';

import { textFiles } from './buildScan.mjs';
import { expect, watch } from './helpers';

type Rect = { x: number; y: number; width: number; height: number };
const real = (messages: string[]) => messages.filter((m) => !/GPU stall|ReadPixels/.test(m));

async function open(page: Page, id: 'R' | 'D', path = 'displayharness', query = '') {
  await page.setViewportSize({ width: 800, height: 1000 });
  await page.addInitScript(() => {
    const counts: Record<string, number> = {};
    const wrap = (name: 'addEventListener' | 'removeEventListener', delta: number) => {
      const original = EventTarget.prototype[name];
      EventTarget.prototype[name] = function (this: EventTarget, type: string, ...rest: any[]) {
        const kind = this === window ? 'window' : this === document ? 'document' : '';
        if (kind) counts[`${kind}:${type}`] = (counts[`${kind}:${type}`] ?? 0) + delta;
        return (original as any).call(this, type, ...rest);
      } as any;
    };
    wrap('addEventListener', 1);
    wrap('removeEventListener', -1);
    (window as any).__listeners = counts;
  });
  await page.goto(`/${path}/?full=${id}${query}`);
  await page.getByTestId(`mount-${id}`).click();
  await page.waitForFunction((s) => !!(window as any).__display.stages[s], id, { timeout: 20_000 });
  await page.waitForFunction((s) => (window as any).__display.stages[s].layouts.length > 0, id);
}

const R = (page: Page) => ({
  scrollX: () => page.evaluate(() => -((window as any).__display.stages.R.strip.scrollX as number) || 0),
  /** The strip's viewport in page coordinates. */
  box: () =>
    page.evaluate(() => {
      const s = (window as any).__display.stages.R;
      const o = s.app.canvas.getBoundingClientRect();
      const a = s.strip.toGlobal({ x: 0, y: 0 });
      const b = s.strip.toGlobal({ x: 600, y: 200 });
      return { x: o.left + a.x, y: o.top + a.y, width: b.x - a.x, height: b.y - a.y } as Rect;
    }),
  card: (i: number) => page.evaluate((n) => (window as any).__display.stages.R.rectOf(`card-${n}`, 'drawn') as Rect, i),
  log: () => page.evaluate(() => (window as any).__display.log as any[]),
  clear: () =>
    page.evaluate(() => {
      (window as any).__display.log.length = 0;
    }),
});
const centre = (r: Rect) => ({ x: r.x + r.width / 2, y: r.y + r.height / 2 });
/** What one card reported, in order. */
async function seq(page: Page, target: string) {
  return ((await R(page).log()) as any[])
    .filter((e) => e.target === target && e.type !== 'hover' && e.type !== 'out')
    .map((e) => (e.type === 'cancel' ? `cancel:${e.reason}` : e.type));
}
const settle = (page: Page, ms = 150) => page.waitForTimeout(ms);

async function drag(page: Page, from: { x: number; y: number }, dx: number, steps = 8) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + dx, from.y, { steps });
  await page.mouse.up();
}

test.describe('Scroll strip (mouse)', () => {
  test('the wheel scrolls the strip, clamped at both ends, and the page gets no stray wheel listener left behind', async ({
    page,
  }) => {
    const seen = watch(page);
    await open(page, 'R');
    const box = await R(page).box();
    await page.mouse.move(box.x + 50, box.y + 50);
    expect(await R(page).scrollX()).toBe(0);
    await page.mouse.wheel(0, 200);
    await settle(page);
    const first = await R(page).scrollX();
    expect(first).toBeGreaterThan(100);
    await page.mouse.wheel(0, 9000);
    await settle(page);
    const end = await R(page).scrollX();
    // 12 cards of 120 + 11 gaps of 10 + padding 10 on each side = 1570 wide in a 600 wide view
    expect(end).toBeCloseTo(970, -1);
    await page.mouse.wheel(0, -20000);
    await settle(page);
    expect(await R(page).scrollX()).toBe(0);
    expect(real(seen.messages)).toEqual([]);
  });

  test('a tap on a card is a tap and the strip does not move', async ({ page }) => {
    await open(page, 'R');
    await page.mouse.click(...(Object.values(centre(await R(page).card(1))) as [number, number]));
    await settle(page);
    expect(await seq(page, 'card-1')).toEqual(['press', 'release', 'tap']);
    expect(await R(page).scrollX()).toBe(0);
  });

  test('a small movement under the threshold is still a tap; past it the strip owns the drag and the card gets a cancel', async ({
    page,
  }) => {
    await open(page, 'R');
    const c = centre(await R(page).card(1));
    await drag(page, c, 6, 3);
    await settle(page);
    expect(await seq(page, 'card-1')).toEqual(['press', 'release', 'tap']);

    await R(page).clear();
    const d = centre(await R(page).card(2));
    await drag(page, d, -160);
    await settle(page);
    expect(await seq(page, 'card-2')).toEqual(['press', 'cancel:claimed']); // never a tap, never selected
    expect(await R(page).scrollX()).toBeGreaterThan(80);
    expect(await R(page).log()).not.toContainEqual(expect.objectContaining({ type: 'tap' }));
  });

  test('a drag that ends over another card selects neither', async ({ page }) => {
    await open(page, 'R');
    const a = centre(await R(page).card(1));
    const b = centre(await R(page).card(3));
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move(b.x, b.y, { steps: 10 });
    await page.mouse.up();
    await settle(page);
    expect((await R(page).log()).filter((e) => e.type === 'tap')).toEqual([]);
  });

  test('a press on a strip that is still coasting stops it and is not a tap', async ({ page }) => {
    await open(page, 'R');
    const box = await R(page).box();
    const from = { x: box.x + box.width - 40, y: box.y + 80 };
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(from.x - 240, from.y, { steps: 6 }); // a fast fling
    await page.mouse.up();
    const a = await R(page).scrollX();
    await page.waitForTimeout(60);
    const b = await R(page).scrollX();
    expect(b).toBeGreaterThan(a); // still coasting
    await R(page).clear();
    const target = await R(page).card(0);
    const p = { x: box.x + 60, y: box.y + 80 };
    await page.mouse.move(p.x, p.y);
    await page.mouse.down();
    await page.waitForTimeout(250);
    const stopped = await R(page).scrollX();
    await page.waitForTimeout(200);
    expect(await R(page).scrollX()).toBe(stopped); // held still while pressed
    await page.mouse.up();
    await settle(page);
    expect((await R(page).log()).filter((e) => e.type === 'tap')).toEqual([]);
    expect(target).toBeTruthy();
  });

  test('cards outside the strip view cannot be selected through the clip', async ({ page }) => {
    await open(page, 'R');
    const box = await R(page).box();
    // card 5 starts well to the right of the 600 wide view: its drawn rect is clipped away
    const far = await R(page).card(5);
    expect(far.x).toBeGreaterThan(box.x + box.width);
    await page.mouse.click(far.x + far.width / 2, far.y + far.height / 2);
    await settle(page);
    expect(await seq(page, 'card-5')).toEqual([]);
    // a card cut by the right edge: click in the part that is clipped (outside the view)
    const cut = await R(page).card(4);
    if (cut.x < box.x + box.width && cut.x + cut.width > box.x + box.width) {
      await page.mouse.click(box.x + box.width + 5, cut.y + cut.height / 2);
      await settle(page);
      expect(await seq(page, 'card-4')).toEqual([]);
    }
  });

  test('pause stops the strip and ignores the wheel; resume lets it work again', async ({ page }) => {
    await open(page, 'R');
    const box = await R(page).box();
    const from = { x: box.x + box.width - 40, y: box.y + 80 };
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(from.x - 240, from.y, { steps: 6 });
    await page.mouse.up();
    await page.getByTestId('pause-R').click();
    await page.waitForTimeout(100);
    const frozen = await R(page).scrollX();
    await page.waitForTimeout(250);
    expect(await R(page).scrollX()).toBe(frozen);
    await page.mouse.wheel(0, 300);
    await page.waitForTimeout(150);
    expect(await R(page).scrollX()).toBe(frozen);
    await page.getByTestId('resume-R').click();
    await page.mouse.move(box.x + 50, box.y + 50);
    await page.mouse.wheel(0, 100);
    await page.waitForTimeout(200);
    expect(await R(page).scrollX()).not.toBe(frozen);
  });

  test('unmount releases the wheel listener, the ticker callback and every signal', async ({ page }) => {
    await open(page, 'R');
    const during = await page.evaluate(() => (window as any).__listeners['document:wheel'] ?? 0);
    expect(during).toBe(1);
    const state = await page.evaluate(async () => {
      const d = (window as any).__display;
      const strip = d.stages.R.strip;
      const ticker = d.stages.R.app.ticker;
      const before = ticker.count;
      document.querySelector<HTMLButtonElement>('[data-testid="unmount-R"]')!.click();
      await new Promise((r) => setTimeout(r, 300));
      return { before, destroyed: strip.destroyed, wheel: (window as any).__listeners['document:wheel'] ?? 0 };
    });
    expect(state.destroyed).toBe(true);
    expect(state.wheel).toBe(0);
    // remount works and has exactly one listener again
    await page.getByTestId('mount-R').click();
    await page.waitForFunction(() => !!(window as any).__display.stages.R);
    expect(await page.evaluate(() => (window as any).__listeners['document:wheel'] ?? 0)).toBe(1);
  });

  test('the strip is laid out again on resize and a card still taps', async ({ page }) => {
    await open(page, 'R');
    await page.setViewportSize({ width: 500, height: 700 });
    await page.waitForTimeout(300);
    await page.mouse.click(...(Object.values(centre(await R(page).card(0))) as [number, number]));
    await settle(page);
    expect(await seq(page, 'card-0')).toEqual(['press', 'release', 'tap']);
  });
});

test.describe('Scroll strip (touch)', () => {
  test.use({ hasTouch: true });

  async function touchDrag(page: Page, session: CDPSession, from: { x: number; y: number }, dx: number) {
    const send = (type: 'touchStart' | 'touchMove' | 'touchEnd', x: number) =>
      session.send('Input.dispatchTouchEvent', {
        type,
        touchPoints: type === 'touchEnd' ? [] : [{ x, y: from.y, id: 1 }],
      });
    await send('touchStart', from.x);
    for (let i = 1; i <= 8; i++) {
      await send('touchMove', from.x + (dx * i) / 8);
      await page.waitForTimeout(16);
    }
    await send('touchEnd', from.x + dx);
  }

  test('a touch drag scrolls the strip and selects nothing; a tap selects one card', async ({ page }) => {
    await open(page, 'R');
    const session = await page.context().newCDPSession(page);
    const c = centre(await R(page).card(1));
    await touchDrag(page, session, c, -180);
    await settle(page, 300);
    expect(await R(page).scrollX()).toBeGreaterThan(60);
    expect((await R(page).log()).filter((e) => e.type === 'tap')).toEqual([]);
    expect(await seq(page, 'card-1')).toEqual(['press', 'cancel:claimed']);
    // let it come to rest, then tap
    await page.waitForTimeout(1500);
    await R(page).clear();
    const box = await R(page).box();
    const x = box.x + 40;
    const y = box.y + 80;
    await page.touchscreen.tap(x, y);
    await settle(page);
    const taps = (await R(page).log()).filter((e) => e.type === 'tap');
    expect(taps).toHaveLength(1);
  });
});

// ---- remote sprites -------------------------------------------------------------------------------------------

const probePng = (name: string) => `tests/fixtures/display-harness/public/assets/displayprobe/images/@1x/${name}`;
const CORS = { 'access-control-allow-origin': '*' };
const ORIGIN = 'http://images.test';

/** Serves images from a made-up origin; a held request waits until the test releases it. */
async function serveImages(page: Page) {
  const hits: string[] = [];
  const holds = new Map<string, () => void>();
  const gates = new Map<string, Promise<void>>();
  await page.route(/^http:\/\/images\.test\//, async (route) => {
    const url = new URL(route.request().url());
    hits.push(url.pathname);
    const gate = gates.get(url.pathname);
    if (gate) await gate;
    if (url.pathname.includes('missing')) return route.fulfill({ status: 404, headers: CORS, body: 'no' });
    return route.fulfill({
      status: 200,
      headers: { ...CORS, 'content-type': 'image/png' },
      path: probePng('badges.png'),
    });
  });
  return {
    hits,
    hold(path: string) {
      gates.set(path, new Promise<void>((resolveGate) => holds.set(path, resolveGate)));
    },
    release(path: string) {
      holds.get(path)?.();
    },
  };
}

const sprite = (page: Page) => ({
  make: (name: string, allowed: string[] = [ORIGIN], rect?: { width: number; height: number; isForced?: boolean }) =>
    page.evaluate(
      ([n, a, r]) => {
        const d = (window as any).__display;
        const w = window as any;
        w.__sprites = w.__sprites ?? {};
        w.__sprites[n] = { loaded: 0, failed: [] as string[] };
        d.stages.D.makeSprite(n, {
          allowedOrigins: a,
          boundingRect: r,
          onLoaded: () => w.__sprites[n].loaded++,
          onFailed: (url: string) => w.__sprites[n].failed.push(url),
        });
      },
      [name, allowed, rect] as const,
    ),
  show: (name: string, url: string) =>
    page.evaluate(([n, u]) => (window as any).__display.stages.D.sprite(n).showImage(u) as boolean, [name, url]),
  destroy: (name: string) => page.evaluate((n) => (window as any).__display.stages.D.sprite(n).destroy(), name),
  state: (name: string) =>
    page.evaluate((n) => {
      const w = window as any;
      const s = w.__display.stages.D.sprite(n);
      return {
        ...w.__sprites[n],
        url: s.currentUrl as string,
        width: s.getWidth() as number,
        height: s.getHeight() as number,
      };
    }, name),
  stats: () => page.evaluate(() => (window as any).__display.remoteStats() as Record<string, { refs: number }>),
  cached: (url: string) => page.evaluate((u) => (window as any).__display.hasAlias(u) as boolean, url),
});

test.describe('Remote sprites (PixDynamicSprite)', () => {
  test('a cross-origin image loads, is fitted into its rectangle and reports once', async ({ page }) => {
    const seen = watch(page);
    const imgs = await serveImages(page);
    await open(page, 'D');
    const s = sprite(page);
    await s.make('a', [ORIGIN], { width: 100, height: 100 });
    expect(await s.show('a', `${ORIGIN}/cards/one.png`)).toBe(true);
    await page.waitForFunction(() => (window as any).__sprites.a.loaded === 1);
    const st = await s.state('a');
    expect(Math.max(st.width, st.height)).toBeCloseTo(100, 0);
    expect(st.failed).toEqual([]);
    expect(imgs.hits).toEqual(['/cards/one.png']);
    expect(real(seen.messages.filter((m) => !/images\.test/.test(m)))).toEqual([]);
  });

  test('a forced rectangle stretches the image', async ({ page }) => {
    await serveImages(page);
    await open(page, 'D');
    const s = sprite(page);
    await s.make('a', [ORIGIN], { width: 90, height: 40, isForced: true });
    await s.show('a', `${ORIGIN}/cards/one.png`);
    await page.waitForFunction(() => (window as any).__sprites.a.loaded === 1);
    const st = await s.state('a');
    expect(st.width).toBeCloseTo(90, 0);
    expect(st.height).toBeCloseTo(40, 0);
  });

  test('a missing image shows the fallback, reports the failure and holds no reference', async ({ page }) => {
    await serveImages(page);
    await open(page, 'D');
    const s = sprite(page);
    await s.make('a');
    await s.show('a', `${ORIGIN}/cards/missing.png`);
    await page.waitForFunction(() => (window as any).__sprites.a.failed.length === 1, null, { timeout: 30_000 });
    const st = await s.state('a');
    expect(st.loaded).toBe(0);
    expect(st.failed).toEqual([`${ORIGIN}/cards/missing.png`]);
    await s.destroy('a');
    await expect.poll(async () => (await s.stats())[`${ORIGIN}/cards/missing.png`]?.refs ?? 0).toBe(0);
  });

  test('an origin that is not allowed, and a URL that is not an image, are refused before any request', async ({
    page,
  }) => {
    const imgs = await serveImages(page);
    await open(page, 'D');
    const s = sprite(page);
    await s.make('a', []);
    expect(await s.show('a', `${ORIGIN}/cards/one.png`)).toBe(false);
    expect(await s.show('a', '/assets/displayprobe/images/@1x/badges.json')).toBe(false);
    expect(await s.show('a', 'javascript:alert(1)//x.png')).toBe(false);
    expect(imgs.hits).toEqual([]);
    expect((await s.state('a')).failed).toHaveLength(3);
  });

  test('two sprites showing one URL make one request and share one load; the last release frees it', async ({
    page,
  }) => {
    const imgs = await serveImages(page);
    await open(page, 'D');
    const s = sprite(page);
    const url = `${ORIGIN}/cards/shared.png`;
    await s.make('a');
    await s.make('b');
    await s.show('a', url);
    await s.show('b', url);
    await page.waitForFunction(
      () => (window as any).__sprites.a.loaded === 1 && (window as any).__sprites.b.loaded === 1,
    );
    expect(imgs.hits).toEqual(['/cards/shared.png']);
    expect((await s.stats())[url].refs).toBe(2);
    await s.destroy('a');
    await expect.poll(async () => (await s.stats())[url].refs).toBe(1);
    expect(await s.cached(url)).toBe(true); // still shown by b
    await s.destroy('b');
    await expect.poll(async () => (await s.stats())[url].refs).toBe(0);
    await expect.poll(() => s.cached(url)).toBe(false);
  });

  test('a URL change while the first image is loading ignores the first when it arrives', async ({ page }) => {
    const seen = watch(page);
    const imgs = await serveImages(page);
    imgs.hold('/cards/slow.png');
    await open(page, 'D');
    const s = sprite(page);
    await s.make('a');
    await s.show('a', `${ORIGIN}/cards/slow.png`);
    await expect.poll(() => imgs.hits.length).toBe(1);
    await s.show('a', `${ORIGIN}/cards/fast.png`);
    await page.waitForFunction(() => (window as any).__sprites.a.loaded === 1);
    imgs.release('/cards/slow.png');
    await page.waitForTimeout(400);
    const st = await s.state('a');
    expect(st.loaded).toBe(1); // only the second one was reported
    expect(st.url).toBe(`${ORIGIN}/cards/fast.png`);
    const stats = await s.stats();
    expect(stats[`${ORIGIN}/cards/slow.png`]?.refs ?? 0).toBe(0);
    expect(stats[`${ORIGIN}/cards/fast.png`].refs).toBe(1);
    await expect.poll(() => s.cached(`${ORIGIN}/cards/slow.png`)).toBe(false); // freed once its load finished
    expect(real(seen.messages.filter((m) => !/images\.test/.test(m)))).toEqual([]);
  });

  test('destroying a sprite while its image is loading is safe and frees the image when it arrives', async ({
    page,
  }) => {
    const seen = watch(page);
    const imgs = await serveImages(page);
    imgs.hold('/cards/slow.png');
    await open(page, 'D');
    const s = sprite(page);
    await s.make('a');
    await s.show('a', `${ORIGIN}/cards/slow.png`);
    await expect.poll(() => imgs.hits.length).toBe(1);
    await s.destroy('a');
    imgs.release('/cards/slow.png');
    await page.waitForTimeout(500);
    await expect.poll(() => s.cached(`${ORIGIN}/cards/slow.png`)).toBe(false);
    expect((await s.stats())[`${ORIGIN}/cards/slow.png`]?.refs ?? 0).toBe(0);
    expect(await page.evaluate(() => (window as any).__sprites.a.loaded)).toBe(0);
    expect(real(seen.messages.filter((m) => !/images\.test/.test(m)))).toEqual([]);
  });

  test('unmounting the stage destroys its sprites and gives their images back', async ({ page }) => {
    await serveImages(page);
    await open(page, 'D');
    const s = sprite(page);
    const url = `${ORIGIN}/cards/one.png`;
    await s.make('a');
    await s.show('a', url);
    await page.waitForFunction(() => (window as any).__sprites.a.loaded === 1);
    await page.getByTestId('unmount-D').click();
    await expect.poll(async () => (await s.stats())[url]?.refs ?? 0).toBe(0);
    await expect.poll(() => s.cached(url)).toBe(false);
  });
});

// ---- the FPS meter --------------------------------------------------------------------------------------------

test.describe('FPS meter (development aid)', () => {
  test('a development build shows it only with ?fps=1 and removes its ticker callback on destroy', async ({ page }) => {
    await open(page, 'R', 'displayharnessdev', '&fps=1');
    await page.waitForFunction(() => /^FPS : \d+$/.test((window as any).__display.stages.R.fps?.text ?? ''), null, {
      timeout: 10_000,
    });
    const result = await page.evaluate(() => {
      const c = (window as any).__display.stages.R;
      const before = c.tickerCount();
      c.fps.destroy();
      return { before, after: c.tickerCount(), destroyed: c.fps.destroyed };
    });
    expect(result.destroyed).toBe(true);
    expect(result.after).toBe(result.before - 1);
  });

  test('a development build without ?fps=1 has no meter', async ({ page }) => {
    await open(page, 'R', 'displayharnessdev');
    expect(await page.evaluate(() => (window as any).__display.stages.R.fps)).toBeNull();
  });

  test('a production build has no meter even with ?fps=1, and its code is not in any production bundle', async ({
    page,
  }) => {
    await open(page, 'R', 'displayharness', '&fps=1');
    expect(await page.evaluate(() => (window as any).__display.stages.R.fps)).toBeNull();
    for (const name of ['displayharness', 'higherlower', 'accacrash', 'lastmanstanding']) {
      for (const { file, code } of textFiles(name).filter((f) => f.file.endsWith('.js'))) {
        expect(code, `${name}: ${file}`).not.toContain('FPS : ');
      }
    }
  });
});
