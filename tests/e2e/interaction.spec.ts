// Interaction inside a Pixi scene, in a real browser (display harness stage T, npm run build:harness then npm run test:e2e):
// mouse and touch taps reported to React as typed events, tap versus drag, presses by pointer id, pointercancel, release
// outside, disabling, pause / hidden tab / context loss mid-press, multi-touch, hit areas (padding, minimum target, gap
// splitting), rebinding, removal and destruction, the keyboard-accessible React twin, and listener cleanup.
// Docs: docs/PBF-PIXI-CAPABILITY-MATRIX.md.
import { type CDPSession, type Page, test } from '@playwright/test';

import { expect, watch } from './helpers';

type Rect = { x: number; y: number; width: number; height: number };
const real = (messages: string[]) => messages.filter((m) => !/GPU stall|ReadPixels/.test(m));

async function open(page: Page, size = { width: 800, height: 1000 }) {
  await page.setViewportSize(size);
  await page.addInitScript(() => {
    // net addEventListener minus removeEventListener on the window, the document and canvases, by event type
    const counts: Record<string, number> = {};
    const wrap = (name: 'addEventListener' | 'removeEventListener', delta: number) => {
      const original = EventTarget.prototype[name];
      EventTarget.prototype[name] = function (this: EventTarget, type: string, ...rest: any[]) {
        const kind =
          this === window
            ? 'window'
            : this === document
              ? 'document'
              : this instanceof HTMLCanvasElement
                ? 'canvas'
                : '';
        if (kind) counts[`${kind}:${type}`] = (counts[`${kind}:${type}`] ?? 0) + delta;
        return (original as any).call(this, type, ...rest);
      } as any;
    };
    wrap('addEventListener', 1);
    wrap('removeEventListener', -1);
    (window as any).__listeners = counts;
  });
  await page.goto('/displayharness/?full=T');
  await page.getByTestId('mount-T').waitFor();
  await mountT(page);
}
async function mountT(page: Page) {
  await page.getByTestId('mount-T').click();
  await page.waitForFunction(() => !!(window as any).__display.stages.T, null, { timeout: 20_000 });
  await page.waitForFunction(() => (window as any).__display.stages.T.layouts.length > 0);
}
const rect = (page: Page, target: string, which: 'hit' | 'drawn' = 'drawn') =>
  page.evaluate(([t, w]) => (window as any).__display.stages.T.rectOf(t, w) as Rect, [target, which] as const);
const centre = (r: Rect) => ({ x: r.x + r.width / 2, y: r.y + r.height / 2 });
const at = async (page: Page, target: string) => centre(await rect(page, target));
const log = (page: Page) => page.evaluate(() => (window as any).__display.log as any[]);
const clearLog = (page: Page) =>
  page.evaluate(() => {
    (window as any).__display.log.length = 0;
    for (const k of Object.keys((window as any).__display.selected)) delete (window as any).__display.selected[k];
  });
/** The event types in order, hover and out left out (they come and go with the mouse), cancels with their reason. */
const sequence = async (page: Page, target?: string) =>
  (await log(page))
    .filter((e) => e.type !== 'hover' && e.type !== 'out' && (!target || e.target === target))
    .map((e) => (e.type === 'cancel' ? `cancel:${e.reason}` : e.type));
const selected = (page: Page, target: string) =>
  page.evaluate((t) => ((window as any).__display.selected[t] ?? 0) as number, target);
const click = (page: Page, testId: string) => page.getByTestId(testId).evaluate((b: HTMLElement) => b.click()); // programmatic: leaves a held mouse button alone
async function cdp(page: Page): Promise<CDPSession> {
  return page.context().newCDPSession(page);
}
const touch = (
  session: CDPSession,
  type: 'touchStart' | 'touchEnd' | 'touchCancel',
  points: Array<{ x: number; y: number; id: number }>,
) =>
  session.send('Input.dispatchTouchEvent', {
    type,
    touchPoints: type === 'touchEnd' || type === 'touchCancel' ? [] : points,
  });

test.describe('Interaction (mouse)', () => {
  test('a click is one tap reported to React with the design position; hover comes and goes with the mouse', async ({
    page,
  }) => {
    const seen = watch(page);
    await open(page);
    const { x, y } = await at(page, 'pad');
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.up();
    expect(await sequence(page, 'pad')).toEqual(['press', 'release', 'tap']);
    const events = await log(page);
    const tap = events.find((e) => e.type === 'tap');
    expect(tap.pointer).toBe('mouse');
    expect(Math.abs(tap.x - 400), 'design x').toBeLessThan(2);
    expect(Math.abs(tap.y - 300), 'design y').toBeLessThan(2);
    expect(events.some((e) => e.type === 'hover' && e.target === 'pad')).toBe(true);
    expect(await selected(page, 'pad'), "React's action ran once").toBe(1);
    await page.mouse.move(2, 600);
    expect((await log(page)).some((e) => e.type === 'out' && e.target === 'pad')).toBe(true);
    expect(seen.failed).toEqual([]);
    expect(real(seen.messages)).toEqual([]);
  });

  test('a press that moves more than 10 css px is a drag; moving less is still a tap; release outside cancels', async ({
    page,
  }) => {
    await open(page);
    const { x, y } = await at(page, 'pad'); // the pad has 20 design px of padding, so there is room to move inside it
    const press = async (dx: number, dy: number, releaseAt?: { x: number; y: number }) => {
      await clearLog(page);
      await page.mouse.move(x, y);
      await page.mouse.down();
      await page.mouse.move(x + dx, y + dy, { steps: 4 });
      if (releaseAt) await page.mouse.move(releaseAt.x, releaseAt.y, { steps: 4 });
      await page.mouse.up();
      return sequence(page, 'pad');
    };
    expect(await press(8, 0), 'under the threshold').toEqual(['press', 'release', 'tap']);
    expect(await press(14, 0), 'over the threshold, released on the object').toEqual(['press', 'release']);
    expect(await press(14, 0, { x: x - 200, y: y + 200 }), 'moved away and released outside').toEqual([
      'press',
      'release',
      'cancel:outside',
    ]);
    expect(await press(14, 0, { x, y }), 'went out and came back: still a drag').toEqual(['press', 'release']);
  });

  test('a disabled object does nothing; disabling mid-press cancels once; enabling restores it', async ({ page }) => {
    await open(page);
    const off = await at(page, 'off');
    await page.mouse.click(off.x, off.y);
    expect(await sequence(page, 'off'), 'a disabled object is silent').toEqual([]);
    const state = await page.evaluate(() => {
      const o = (window as any).__display.stages.T.object('off');
      return { cursor: o.cursor, alpha: o.alpha, mode: o.eventMode };
    });
    expect(state).toEqual({ cursor: 'default', alpha: 0.5, mode: 'none' });
    expect(await page.getByTestId('twin-off').count(), 'no twin for it').toBe(0);

    await clearLog(page);
    const one = await at(page, 'one');
    await page.mouse.move(one.x - 4, one.y); // inside one's half of the gap, away from two
    await page.mouse.down();
    await click(page, 'disable-one');
    await page.mouse.up();
    expect(await sequence(page, 'one')).toEqual(['press', 'cancel:disabled']);
    expect(await selected(page, 'one')).toBe(0);
    await expect(page.getByTestId('twin-one')).toBeDisabled();
    await page.mouse.click(one.x - 4, one.y);
    expect(await sequence(page, 'one'), 'still disabled').toEqual(['press', 'cancel:disabled']);

    await click(page, 'enable-one');
    await page.mouse.click(one.x - 4, one.y);
    expect(await sequence(page, 'one')).toEqual(['press', 'cancel:disabled', 'press', 'release', 'tap']);
    expect(await selected(page, 'one')).toBe(1);
  });

  test('pausing the stage, hiding the tab or losing the context cancels a press and blocks input until it returns', async ({
    page,
  }) => {
    await open(page);
    const { x, y } = await at(page, 'pad');
    // paused
    await page.mouse.move(x, y);
    await page.mouse.down();
    await click(page, 'pause-T');
    await expect.poll(() => sequence(page, 'pad')).toEqual(['press', 'cancel:blocked']);
    await page.mouse.up();
    expect(await sequence(page, 'pad'), 'the release of a cancelled press is ignored').toEqual([
      'press',
      'cancel:blocked',
    ]);
    await page.mouse.click(x, y);
    expect(await sequence(page, 'pad'), 'input is blocked while paused').toEqual(['press', 'cancel:blocked']);
    expect(await page.evaluate(() => (window as any).__display.stages.T.object('pad').eventMode)).toBe('none');
    await click(page, 'resume-T');
    await page.mouse.click(x, y);
    expect((await sequence(page, 'pad')).slice(-3)).toEqual(['press', 'release', 'tap']);

    // hidden tab
    await clearLog(page);
    await page.mouse.move(x, y);
    await page.mouse.down();
    const setHidden = (hidden: boolean) =>
      page.evaluate((h) => {
        Object.defineProperty(document, 'hidden', { configurable: true, get: () => h });
        document.dispatchEvent(new Event('visibilitychange'));
      }, hidden);
    await setHidden(true);
    await expect.poll(() => sequence(page, 'pad')).toEqual(['press', 'cancel:blocked']);
    await page.mouse.up();
    await setHidden(false);
    await page.mouse.click(x, y);
    expect((await sequence(page, 'pad')).slice(-3)).toEqual(['press', 'release', 'tap']);

    // lost context, then restored
    await clearLog(page);
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.evaluate(() => {
      const gl = ((window as any).__display.stages.T.app.canvas as HTMLCanvasElement).getContext(
        'webgl2',
      ) as WebGL2RenderingContext;
      const ext = gl.getExtension('WEBGL_lose_context')!;
      (window as any).__lose = ext;
      ext.loseContext();
    });
    await expect.poll(() => sequence(page, 'pad')).toEqual(['press', 'cancel:blocked']);
    await page.mouse.up();
    await page.evaluate(() => (window as any).__lose.restoreContext());
    await expect
      .poll(
        async () => {
          await page.mouse.click(x, y);
          return (await sequence(page, 'pad')).slice(-1)[0];
        },
        { timeout: 8000 },
      )
      .toBe('tap');
  });

  test('hit areas: padding, the minimum target, and neighbours splitting the gap', async ({ page }) => {
    await open(page);
    const scale = await page.evaluate(() => (window as any).__display.stages.T.root.scale.x as number);
    // padding: a point inside the padding hits, one just beyond it does not
    const pad = await rect(page, 'pad');
    const padHit = await rect(page, 'pad', 'hit');
    expect(padHit.width).toBeCloseTo(pad.width + 2 * 20 * scale, 0);
    const c = centre(pad);
    await page.mouse.click(pad.x - 15 * scale, c.y); // inside the 20 design px padding
    expect(await sequence(page, 'pad')).toEqual(['press', 'release', 'tap']);
    await clearLog(page);
    await page.mouse.click(pad.x - 25 * scale, c.y); // beyond it
    expect(await sequence(page, 'pad')).toEqual([]);

    // a small object reaches the minimum target (44 css px) unless a neighbour is in the way
    const deep = await rect(page, 'deep', 'hit');
    expect(deep.width, 'deep is 60 design px: already large').toBeGreaterThanOrEqual(44 - 0.5);
    const edge = await rect(page, 'edge', 'hit');
    expect(edge.width, 'edge is 16 design px: grown to the minimum').toBeGreaterThanOrEqual(44 - 0.5);
    await clearLog(page);
    const e = await at(page, 'edge');
    await page.mouse.click(e.x, e.y);
    expect(await sequence(page, 'edge'), 'the object in the canvas corner works').toEqual(['press', 'release', 'tap']);

    // two close objects split the gap: no overlap, and a tap on each side of the middle goes to the nearer one
    const oneHit = await rect(page, 'one', 'hit');
    const twoHit = await rect(page, 'two', 'hit');
    expect(oneHit.x + oneHit.width, 'one stops at the midpoint').toBeLessThanOrEqual(twoHit.x + 0.5);
    const one = await rect(page, 'one');
    const two = await rect(page, 'two');
    const middle = (one.x + one.width + two.x) / 2;
    await clearLog(page);
    await page.mouse.click(middle - 1, centre(one).y);
    await page.mouse.click(middle + 1, centre(one).y);
    expect((await log(page)).filter((e) => e.type === 'tap').map((e) => e.target)).toEqual(['one', 'two']);
  });

  test('a click in a React twin button runs the same action from the keyboard, with no canvas input at all', async ({
    page,
  }) => {
    await open(page);
    await page.getByTestId('twin-pad').focus();
    await page.keyboard.press('Enter');
    expect(await selected(page, 'pad')).toBe(1);
    await page.keyboard.press('Space');
    expect(await selected(page, 'pad')).toBe(2);
    await page.getByTestId('twin-deep').focus();
    await page.keyboard.press('Enter');
    expect(await selected(page, 'deep')).toBe(1);
    expect(await log(page), 'the canvas received nothing').toEqual([]);
    // and the canvas tap calls the very same handler
    const { x, y } = await at(page, 'pad');
    await page.mouse.click(x, y);
    expect(await selected(page, 'pad')).toBe(3);
  });

  test('rebinding, removing, destroying and detaching objects cancel presses and leave the others working', async ({
    page,
  }) => {
    await open(page);
    const pad = await at(page, 'pad');
    const deep = await at(page, 'deep');
    const press = async (p: { x: number; y: number }) => {
      await page.mouse.move(p.x, p.y);
      await page.mouse.down();
    };

    // remove mid-press
    await press(pad);
    await page.evaluate(() => (window as any).__display.stages.T.binding.remove('pad'));
    await page.mouse.up();
    expect(await sequence(page, 'pad')).toEqual(['press', 'cancel:removed']);
    expect(await page.evaluate(() => (window as any).__display.stages.T.object('pad').eventMode)).toBe('auto');
    await clearLog(page);
    await page.mouse.click(pad.x, pad.y);
    expect(await sequence(page, 'pad'), 'a removed target is silent').toEqual([]);
    // add it back (a rebind replaces whatever was there)
    await page.evaluate(() => {
      const c = (window as any).__display.stages.T;
      c.binding.add('pad', c.object('pad'), { hitPadding: 20, minTarget: 0 });
    });
    await page.mouse.click(pad.x, pad.y);
    expect(await sequence(page, 'pad')).toEqual(['press', 'release', 'tap']);

    // rebind mid-press: the old press is cancelled once, and there are not two handlers afterwards
    await clearLog(page);
    await press(pad);
    await page.evaluate(() => {
      const c = (window as any).__display.stages.T;
      c.binding.add('pad', c.object('pad'), { hitPadding: 20, minTarget: 0 });
    });
    await page.mouse.up();
    expect(await sequence(page, 'pad')).toEqual(['press', 'cancel:removed']);
    await clearLog(page);
    await page.mouse.click(pad.x, pad.y);
    expect(await sequence(page, 'pad'), 'exactly one set of handlers').toEqual(['press', 'release', 'tap']);

    // taken off the display tree mid-press, then put back
    await clearLog(page);
    await press(pad);
    await page.evaluate(() => {
      const o = (window as any).__display.stages.T.object('pad');
      (window as any).__parent = o.parent;
      (window as any).__obj = o; // detached, so it can no longer be found by its label
      o.parent.removeChild(o);
    });
    await page.mouse.up();
    expect(await sequence(page, 'pad')).toEqual(['press', 'cancel:removed']);
    await page.evaluate(() => {
      const c = (window as any).__display.stages.T;
      (window as any).__parent.addChild((window as any).__obj);
    });
    await clearLog(page);
    await page.mouse.click(pad.x, pad.y);
    expect(await sequence(page, 'pad'), 'works again once it is back on the tree').toEqual(['press', 'release', 'tap']);

    // destroyed mid-press: the binding drops it; the others keep working
    await clearLog(page);
    await press(pad);
    await page.evaluate(() => (window as any).__display.stages.T.object('pad').destroy());
    await page.mouse.up();
    expect(await sequence(page, 'pad')).toEqual(['press', 'cancel:removed']);
    expect(await page.evaluate(() => (window as any).__display.stages.T.binding.targets().includes('pad'))).toBe(false);
    await clearLog(page);
    await page.mouse.click(deep.x, deep.y);
    expect(await sequence(page, 'deep')).toEqual(['press', 'release', 'tap']);

    // binding the same root again disposes the first binding: events go to the new one only
    const events = await page.evaluate(() => {
      const d = (window as any).__display;
      const c = d.stages.T;
      const got: string[] = [];
      d.UIUtil.bindInteractions(
        {
          app: c.app,
          root: c.app.stage,
          track: () => undefined,
          input: { blocked: false, onBlockedChange: () => () => undefined },
        },
        c.root,
        [
          {
            type: 'shape',
            id: 'deep',
            x: 0,
            y: 0,
            shape: 'rect',
            width: 1,
            height: 1,
            fill: 0,
            interactive: { event: 'deep2' },
          },
        ],
        (e: any) => got.push(e.type + ':' + e.target),
      );
      (window as any).__got = got;
      return c.binding.targets();
    });
    expect(events, 'the old binding still lists its targets but is disposed').toBeDefined();
    await clearLog(page);
    await page.mouse.click(deep.x, deep.y);
    expect(await log(page), 'the first binding no longer reports').toEqual([]);
    expect(await page.evaluate(() => (window as any).__got)).toEqual(['press:deep2', 'release:deep2', 'tap:deep2']);
  });

  test('tearing the stage down mid-press is silent; mounting again 20 times leaves no listeners behind', async ({
    page,
  }) => {
    const seen = watch(page);
    await open(page);
    const { x, y } = await at(page, 'pad');
    await page.mouse.move(x, y);
    await page.mouse.down();
    await clearLog(page);
    await click(page, 'unmount-T');
    await page.mouse.up();
    await page.waitForTimeout(100);
    expect(await log(page), 'nothing is emitted to an unmounted screen').toEqual([]);
    expect(await page.evaluate(() => (window as any).__display.errors)).toEqual([]);

    // one warm-up cycle, then twenty more: the net listener counts do not move
    await mountT(page);
    await page.getByTestId('unmount-T').click();
    const counts = () => page.evaluate(() => ({ ...(window as any).__listeners }) as Record<string, number>);
    const before = await counts();
    for (let i = 0; i < 20; i++) {
      await mountT(page);
      const p = await at(page, 'pad');
      await page.mouse.click(p.x, p.y);
      await page.getByTestId('unmount-T').click();
      await page.waitForFunction(() => !(window as any).__display.stages.T);
    }
    await page.waitForTimeout(200);
    // Pixi removes its resize listener twice per destroy (documented, harmless), so a count may go down; it may never go up
    const after = await counts();
    for (const key of Object.keys(after))
      expect(after[key], `net listeners of ${key}`).toBeLessThanOrEqual(before[key] ?? 0);
    expect(seen.failed).toEqual([]);
    expect(real(seen.messages)).toEqual([]);
  });
});

test.describe('Interaction (touch)', () => {
  test.use({ hasTouch: true });

  test('a tap is one tap with pointer touch and no hover', async ({ page }) => {
    await open(page);
    const { x, y } = await at(page, 'pad');
    await page.touchscreen.tap(x, y);
    const events = await log(page);
    expect(events.filter((e) => e.target === 'pad').map((e) => e.type)).toEqual(['press', 'release', 'tap']);
    expect(events.find((e) => e.type === 'tap').pointer).toBe('touch');
    expect(
      events.some((e) => e.type === 'hover'),
      'touch has no hover',
    ).toBe(false);
    expect(await selected(page, 'pad')).toBe(1);
  });

  test('a touch cancelled by the system (pointercancel) cancels the press and emits no tap', async ({ page }) => {
    await open(page);
    const session = await cdp(page);
    const { x, y } = await at(page, 'pad');
    await touch(session, 'touchStart', [{ x, y, id: 1 }]);
    await touch(session, 'touchCancel', []);
    await expect.poll(() => sequence(page, 'pad')).toEqual(['press', 'cancel:pointercancel']);
    expect(await selected(page, 'pad')).toBe(0);
    await page.touchscreen.tap(x, y); // and the next tap works
    expect((await sequence(page, 'pad')).slice(-3)).toEqual(['press', 'release', 'tap']);
  });

  test('two fingers on two objects are independent; a second finger on a pressed object is ignored', async ({
    page,
  }) => {
    await open(page);
    const session = await cdp(page);
    const pad = await at(page, 'pad');
    const deep = await at(page, 'deep');
    await touch(session, 'touchStart', [
      { x: pad.x, y: pad.y, id: 1 },
      { x: deep.x, y: deep.y, id: 2 },
    ]);
    await touch(session, 'touchEnd', []);
    await expect
      .poll(async () =>
        (await log(page))
          .filter((e) => e.type === 'tap')
          .map((e) => e.target)
          .sort(),
      )
      .toEqual(['deep', 'pad']);

    await clearLog(page);
    await touch(session, 'touchStart', [
      { x: pad.x, y: pad.y, id: 1 },
      { x: pad.x + 3, y: pad.y, id: 2 },
    ]);
    await touch(session, 'touchEnd', []);
    await expect.poll(async () => (await log(page)).filter((e) => e.type === 'tap').length).toBeGreaterThan(0);
    expect(
      (await log(page)).filter((e) => e.type === 'press' && e.target === 'pad'),
      'one press for the target',
    ).toHaveLength(1);
    expect(
      (await log(page)).filter((e) => e.type === 'tap' && e.target === 'pad'),
      'one tap',
    ).toHaveLength(1);
  });

  test('on a small phone screen every target is still at least 44 css px and works', async ({ page }) => {
    await open(page, { width: 202, height: 356 });
    // the harness's own buttons would cover a screen this small
    await page.getByTestId('twin-pad').evaluate((b) => ((b.parentElement as HTMLElement).style.display = 'none'));
    for (const target of ['deep', 'edge', 'pad']) {
      const hit = await rect(page, target, 'hit');
      const drawn = await rect(page, target, 'drawn');
      const wanted = target === 'pad' ? 0 : 44 - 0.5; // pad turns the minimum off and keeps its own padding
      expect(hit.width, `${target} hit width`).toBeGreaterThanOrEqual(wanted);
      expect(hit.width).toBeGreaterThanOrEqual(drawn.width);
    }
    const { x, y } = await at(page, 'deep');
    await page.touchscreen.tap(x, y);
    expect(await sequence(page, 'deep')).toEqual(['press', 'release', 'tap']);
  });
});
