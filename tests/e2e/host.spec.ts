// The host bridge in a real browser (host harness: a host page, the game in an iframe on another origin, and rogue frames on the host's
// own origin and a third origin; npm run build:harness then npm run test:e2e): the handshake and typed messages, addresses
// that are never "*", binding to the validated window and origin after HOST_INIT, rejection of a wrong origin, a wrong source window,
// malformed, unknown, wrongly versioned and credential-carrying messages, an empty allowlist, a game outside any host page, the
// adapter boundary, and teardown. Docs: docs/PBF-PIXI-CAPABILITY-MATRIX.md.
import { type Frame, type Page, test } from '@playwright/test';

import { expect } from './helpers';

const HOST = 'http://127.0.0.1:4173'; // the host page: its origin is the allowed one
const GAME = 'http://localhost:4173'; // the game, framed, on another origin
const OTHER = 'http://[::1]:4173'; // a third origin that is not allowed
const BASE = '/hostharness';

async function openHost(page: Page, gameQuery: string, rogues: string[] = []) {
  const child = `${GAME}${BASE}/index.html?${gameQuery}`;
  const rogue = rogues.map((r) => `${r}${BASE}/rogue.html`).join('|');
  await page.goto(`${HOST}${BASE}/parent.html?child=${encodeURIComponent(child)}&rogue=${encodeURIComponent(rogue)}`);
  const game = await frameAt(page, GAME);
  await game.waitForFunction(() => !!(window as any).__game);
  return game;
}
async function frameAt(page: Page, origin: string): Promise<Frame> {
  for (let i = 0; i < 100; i++) {
    const f = page.frames().find((fr) => fr.url().startsWith(origin));
    if (f) return f;
    await page.waitForTimeout(50);
  }
  throw new Error(`no frame at ${origin}`);
}
const seen = (page: Page) =>
  page.evaluate(() => (window as any).__host.seen as Array<{ origin: string; fromGame: boolean; data: any }>);
const probe = <T>(game: Frame, expression: string) => game.evaluate(`window.__game.${expression}`) as Promise<T>;
const hostSend = (page: Page, data: unknown, target = GAME) =>
  page.evaluate(([d, t]) => (window as any).__host.send(d, t), [data, target] as const);
const env = (messageName: string, data?: unknown, protocol = 1) => ({ protocol, messageName, data });
const connected = (game: Frame) => probe<boolean>(game, 'bridge.connected');
const rejected = (game: Frame) => probe<Array<{ reason: string; origin: string }>>(game, 'rejected');

test.describe('Host bridge', () => {
  test('a handshake, then typed messages both ways, all addressed to the host and never to "*"', async ({ page }) => {
    const game = await openHost(page, `allowed=${HOST}`);
    await expect.poll(async () => (await seen(page)).length).toBe(1);
    expect((await seen(page))[0]).toEqual({
      origin: GAME,
      fromGame: true,
      data: { protocol: 1, messageName: 'CANVAS_READY', data: { gameId: 'hostprobe' } },
    });
    expect(await probe<string[]>(game, 'bridge.helloOrigins')).toEqual([HOST]);
    expect(await connected(game)).toBe(false);
    expect(
      await probe<boolean>(game, 'bridge.updateBalanceToWrapper(1)'),
      'nothing but the greeting goes out before HOST_INIT',
    ).toBe(false);

    await hostSend(page, env('HOST_INIT', { currency: 'GBP', language: 'en', soundOn: true }));
    await expect.poll(() => connected(game)).toBe(true);
    expect(await probe<string>(game, 'bridge.hostOrigin')).toBe(HOST);
    expect(await probe(game, 'received')).toEqual([
      { name: 'HOST_INIT', data: { currency: 'GBP', language: 'en', soundOn: true } },
    ]);

    await game.evaluate(() => {
      const b = (window as any).__game.bridge;
      b.updateBalanceToWrapper(12.5);
      b.sendSoundToggleTowrapper(false);
      b.sendShowPopup({ message: 'hello' });
      b.sendProgressUpdate(50);
      b.notifyAppHeight(480);
    });
    await expect.poll(async () => (await seen(page)).length).toBe(6);
    expect((await seen(page)).slice(1).map((m) => [m.data.messageName, m.fromGame, m.data.protocol])).toEqual([
      ['UPDATE_BALANCE', true, 1],
      ['TOGGLE_SOUND', true, 1],
      ['SHOW_POPUP', true, 1],
      ['LOADING_PROGRESS', true, 1],
      ['APP_HEIGHT', true, 1],
    ]);
    const posted = await probe<Array<{ targetOrigin: string }>>(game, 'posted');
    expect(posted).toHaveLength(6);
    expect(
      posted.every((p) => p.targetOrigin === HOST),
      'every message is addressed to the host origin',
    ).toBe(true);

    await hostSend(page, env('IS_AUDIO_ON', { soundOn: false }));
    await hostSend(page, env('STOP_CANVAS'));
    await hostSend(page, env('RESUME_CANVAS'));
    await expect.poll(() => probe<number>(game, 'handlerCalls')).toBe(4);
    expect((await probe<Array<{ name: string }>>(game, 'received')).map((r) => r.name)).toEqual([
      'HOST_INIT',
      'IS_AUDIO_ON',
      'STOP_CANVAS',
      'RESUME_CANVAS',
    ]);
    expect(await rejected(game)).toEqual([]);
  });

  test('with several allowed origins the browser tells the game its host; without discovery every allowed origin is addressed on its own', async ({
    page,
  }) => {
    const game = await openHost(page, `allowed=${HOST},https://other.example`);
    await expect.poll(async () => (await seen(page)).length).toBe(1);
    expect(await probe<string[]>(game, 'bridge.helloOrigins'), 'derived from the browser').toEqual([HOST]);

    const blind = await openHost(page, `allowed=${HOST},https://other.example&discover=0`);
    await expect.poll(async () => (await seen(page)).length).toBe(1); // the host still gets exactly one greeting
    expect(await probe<string[]>(blind, 'bridge.helloOrigins')).toEqual([HOST, 'https://other.example']);
    const targets = (await probe<Array<{ targetOrigin: string }>>(blind, 'posted')).map((p) => p.targetOrigin);
    expect(targets).toEqual([HOST, 'https://other.example']);
    expect(targets).not.toContain('*');
  });

  test('messages from a wrong origin, a wrong window, or with a bad shape never reach a handler, before or after the handshake', async ({
    page,
  }) => {
    const game = await openHost(page, `allowed=${HOST}`, [HOST, OTHER]);
    await expect.poll(async () => (await seen(page)).length).toBe(1);
    const sameOriginRogue = await frameAt(page, `${HOST}${BASE}/rogue.html`);
    const otherOriginRogue = await frameAt(page, OTHER);
    const post = (from: Frame, data: unknown) =>
      from.evaluate((d) => window.parent.frames[0].postMessage(d, '*'), data);

    // before the handshake: a rogue cannot bind the connection
    await post(sameOriginRogue, env('HOST_INIT', {})); // an allowed origin, but not the host window
    await post(otherOriginRogue, env('HOST_INIT', {})); // not an allowed origin
    await expect.poll(async () => (await rejected(game)).length).toBe(2);
    expect((await rejected(game)).map((r) => r.reason)).toEqual(['source', 'origin']);
    expect(await connected(game)).toBe(false);

    // the real host: IS_AUDIO_ON before HOST_INIT is refused, then the handshake works
    await hostSend(page, env('IS_AUDIO_ON', { soundOn: true }));
    await hostSend(page, env('HOST_INIT', {}));
    await expect.poll(() => connected(game)).toBe(true);
    expect((await rejected(game)).map((r) => r.reason).slice(2)).toEqual(['not-connected']);
    const handled = await probe<number>(game, 'handlerCalls');
    expect(handled).toBe(1);

    // after it: the rogues still cannot speak, and the host cannot send nonsense
    await post(sameOriginRogue, env('IS_AUDIO_ON', { soundOn: false }));
    await post(otherOriginRogue, env('STOP_CANVAS'));
    await hostSend(page, 'plain text');
    await hostSend(page, { messageName: 'STOP_CANVAS' }); // no protocol
    await hostSend(page, env('STOP_CANVAS', undefined, 2)); // wrong protocol
    await hostSend(page, env('SHOW_PLACED_BET', {})); // not part of the contract
    await hostSend(page, env('IS_AUDIO_ON', { soundOn: 'loud' })); // wrong data
    await hostSend(page, env('IS_AUDIO_ON', { soundOn: true, session: { beToken: 'abc' } })); // a credential-like key
    await expect.poll(async () => (await rejected(game)).length).toBe(11);
    expect((await rejected(game)).map((r) => r.reason).slice(3)).toEqual([
      'source',
      'origin',
      'malformed',
      'protocol',
      'protocol',
      'unknown',
      'invalid-data',
      'secret',
    ]);
    expect(await probe<number>(game, 'handlerCalls'), 'nothing reached a handler').toBe(handled);
    expect(await connected(game), 'and the binding is intact').toBe(true);
    await hostSend(page, env('RESUME_CANVAS'));
    await expect.poll(() => probe<number>(game, 'handlerCalls')).toBe(handled + 1);
  });

  test('an empty allowlist makes the bridge inert: nothing is sent and nothing is accepted', async ({ page }) => {
    const game = await openHost(page, 'allowed=');
    await page.waitForTimeout(300);
    expect(await seen(page)).toEqual([]);
    expect(await probe<boolean>(game, 'bridge.enabled')).toBe(false);
    expect(await probe<boolean>(game, 'bridge.sendCanvasReady()')).toBe(false);
    await hostSend(page, env('HOST_INIT', {}));
    await page.waitForTimeout(200);
    expect(await connected(game)).toBe(false);
    expect(await probe<number>(game, 'handlerCalls')).toBe(0);
    expect(await probe<unknown[]>(game, 'posted')).toEqual([]);
  });

  test('a game that is not inside a host page is inert and ignores messages to itself', async ({ page }) => {
    await page.goto(`${GAME}${BASE}/index.html?allowed=${GAME}`);
    await page.waitForFunction(() => !!(window as any).__game?.bridge);
    expect(await page.evaluate(() => (window as any).__game.bridge.enabled)).toBe(false);
    expect(await page.evaluate(() => (window as any).__game.bridge.sendCanvasReady())).toBe(false);
    await page.evaluate(() => window.postMessage({ protocol: 1, messageName: 'HOST_INIT', data: {} }, '*'));
    await page.waitForTimeout(150);
    expect(await page.evaluate(() => (window as any).__game.handlerCalls)).toBe(0);
    expect(await page.evaluate(() => (window as any).__game.bridge.connected)).toBe(false);
  });

  test('an operator adapter changes only the shape of messages: validation and binding still apply', async ({
    page,
  }) => {
    const game = await openHost(page, `allowed=${HOST}&adapter=wrapped`);
    await expect.poll(async () => (await seen(page)).length).toBe(1);
    expect((await seen(page))[0].data).toEqual({ op: 'CANVAS_READY', payload: { gameId: 'hostprobe' }, v: 1 });
    await hostSend(page, { op: 'IS_AUDIO_ON', payload: { soundOn: true }, v: 1 }); // before the handshake
    await hostSend(page, { op: 'HOST_INIT', payload: { currency: 'GBP' }, v: 1 });
    await expect.poll(() => connected(game)).toBe(true);
    await hostSend(page, { op: 'IS_AUDIO_ON', payload: { soundOn: true, beToken: 'x' }, v: 1 });
    await expect.poll(async () => (await rejected(game)).length).toBe(2);
    expect((await rejected(game)).map((r) => r.reason)).toEqual(['not-connected', 'secret']);
    await game.evaluate(() => (window as any).__game.bridge.updateBalanceToWrapper(1));
    await expect.poll(async () => (await seen(page)).length).toBe(2);
    expect((await seen(page))[1].data).toEqual({ op: 'UPDATE_BALANCE', payload: { balance: 1 }, v: 1 });
  });

  test('a token or secret is never sent, and an invalid payload is a game bug that throws', async ({ page }) => {
    const game = await openHost(page, `allowed=${HOST}`);
    await hostSend(page, env('HOST_INIT', {}));
    await expect.poll(() => connected(game)).toBe(true);
    const errors = await game.evaluate(() => {
      const b = (window as any).__game.bridge;
      const tries = [
        () => b.postDataToWrapper({ messageName: 'SHOW_POPUP', data: { message: 'x', beToken: 'y' } }),
        () => b.updateBalanceToWrapper(NaN),
        () => b.sendProgressUpdate(300),
        () => b.sendShowPopup({ message: '' }),
      ];
      return tries.map((t) => {
        try {
          t();
          return '';
        } catch (e) {
          return (e as Error).message;
        }
      });
    });
    expect(errors[0]).toMatch(/token or secret/);
    expect(errors[1]).toMatch(/balance/);
    expect(errors[2]).toMatch(/percent/);
    expect(errors[3]).toMatch(/message/);
    expect(
      (await seen(page)).map((m) => m.data.messageName),
      'only the greeting was sent',
    ).toEqual(['CANVAS_READY']);
  });

  test('the bridge code loads only when it connects, and disposing it ends listening and sending; 20 cycles leave no listeners', async ({
    page,
  }) => {
    const scripts: Array<Promise<string>> = [];
    page.on('response', (r) => {
      if (/\.js(\?|$)/.test(r.url())) scripts.push(r.text().catch(() => ''));
    });
    await page.addInitScript(() => {
      const counts: Record<string, number> = {};
      const wrap = (name: 'addEventListener' | 'removeEventListener', delta: number) => {
        const original = EventTarget.prototype[name];
        EventTarget.prototype[name] = function (this: EventTarget, type: string, ...rest: any[]) {
          if (this === window && type === 'message') counts.message = (counts.message ?? 0) + delta;
          return (original as any).call(this, type, ...rest);
        } as any;
      };
      wrap('addEventListener', 1);
      wrap('removeEventListener', -1);
      (window as any).__messageListeners = counts;
    });
    const idle = await openHost(page, `allowed=${HOST}&connect=0`);
    await page.waitForLoadState('networkidle');
    expect(
      (await Promise.all(scripts)).some((t) => t.includes('CANVAS_READY')),
      'no bridge code until it connects',
    ).toBe(false);
    expect(await seen(page)).toEqual([]);

    await idle.evaluate(() => (window as any).__game.connect());
    await expect.poll(async () => (await seen(page)).length).toBe(1);
    expect((await Promise.all(scripts)).some((t) => t.includes('CANVAS_READY'))).toBe(true);
    await hostSend(page, env('HOST_INIT', {}));
    await expect.poll(() => connected(idle)).toBe(true);

    const messages = () => idle.evaluate(() => (window as any).__messageListeners.message as number);
    const before = await messages();
    await idle.evaluate(() => (window as any).__game.disconnect());
    expect(await messages(), 'the listener is gone').toBe(before - 1);
    const calls = await probe<number>(idle, 'handlerCalls');
    const heard = (await seen(page)).length;
    await hostSend(page, env('IS_AUDIO_ON', { soundOn: true }));
    await page.waitForTimeout(150);
    expect(await probe<number>(idle, 'handlerCalls'), 'nothing is handled after dispose').toBe(calls);
    expect(await probe<boolean>(idle, 'bridge.updateBalanceToWrapper(1)')).toBe(false);
    expect((await seen(page)).length, 'nothing is sent after dispose').toBe(heard);

    const baseline = await messages();
    for (let i = 0; i < 20; i++) {
      await idle.evaluate(async () => {
        await (window as any).__game.connect();
        (window as any).__game.disconnect();
      });
    }
    expect(await messages(), 'net message listeners after 20 connect and dispose cycles').toBeLessThanOrEqual(baseline);
  });
});
