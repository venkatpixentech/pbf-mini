// Audio in a real browser, through the audio harness (DOM only; npm run build:harness then npm run test:e2e): lazy loading,
// first-gesture unlock (and retry after a failed resume), measured playback (retrigger, overlap, ambient, loop, fades, stop),
// React controls (mute, volume, groups) with persistence and blocked storage, hidden tab, failed loads, format choice, and
// cleanup. Chrome runs with the autoplay policy a visitor has: a page can play sound only after a gesture. Playback is measured
// with an AnalyserNode on the output, not assumed. Docs: docs/PBF-PIXI-CAPABILITY-MATRIX.md.
import { type Page, test } from '@playwright/test';

import { expect, watch } from './helpers';

test.use({ launchOptions: { args: ['--autoplay-policy=user-gesture-required'] } });

const HARNESS = '/audioharness/';
const SPINE_PIXI = /PixiJS|pixijs\.com|SkeletonJson/;
const AUDIO_CODE = /decodeAudioData/;
const START = 'Matchmaking_Start Button';
const LOOP = 'Total Win_loop';
const TWO = 'Ambient_two';
const SILENT = 2; // the largest swing of silence on the analyser (byte samples)
const LOUD = 5;

/** Scripts a page loads, with their text, to tell which chunks hold which code. */
function watchScripts(page: Page) {
  const pending: Array<Promise<{ url: string; text: string }>> = [];
  page.on('response', (r) => {
    if (/\.js(\?|$)/.test(r.url())) pending.push(r.text().then((text) => ({ url: r.url(), text })));
  });
  return async (pattern: RegExp) =>
    (await Promise.all(pending.map((p) => p.catch(() => ({ url: 'http://x/', text: '' })))))
      .filter((s) => pattern.test(s.text))
      .map((s) => new URL(s.url).pathname);
}

/** Counters installed before the page runs: audio contexts created and closed, net listeners, a resume that fails N times. */
const instrument = (page: Page, extra?: () => void) =>
  page.addInitScript(() => {
    const w = window as any;
    const Original = window.AudioContext;
    let created = 0;
    let closed = 0;
    w.__ac = { created: () => created, closed: () => closed };
    // Chrome under automation lets every page play sound, so the browser's autoplay policy is modelled here: a context made before
    // any gesture is suspended and cannot resume until one has happened (the first gesture is seen before the page's own handlers).
    let activated = false;
    for (const t of ['pointerdown', 'keydown', 'touchend'])
      window.addEventListener(t, () => (activated = true), { capture: true });
    w.AudioContext = class extends Original {
      constructor(...args: any[]) {
        super(...args);
        created++;
        let state: AudioContextState = activated ? 'running' : 'suspended';
        Object.defineProperty(this, 'state', { get: () => state, configurable: true });
        const set = (next: AudioContextState) => {
          if (state === next) return;
          state = next;
          this.dispatchEvent(new Event('statechange'));
        };
        if (!activated) void Original.prototype.suspend.call(this);
        this.resume = async () => {
          if (w.__failResume > 0) {
            w.__failResume--;
            throw new DOMException('not allowed yet', 'NotAllowedError');
          }
          if (!activated) throw new DOMException('needs a gesture', 'NotAllowedError');
          await Original.prototype.resume.call(this);
          set('running');
        };
        this.suspend = async () => {
          await Original.prototype.suspend.call(this);
          set('suspended');
        };
        this.close = () => {
          closed++;
          set('closed');
          return Original.prototype.close.call(this);
        };
      }
    };
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
    w.__listeners = counts;
    extra?.();
  });

async function open(page: Page, query = '') {
  await page.goto(`${HARNESS}${query}`);
}
/** Starts audio with a button press (a gesture, so the browser lets this page play) and waits until every sound is decoded. */
async function start(page: Page, query = '') {
  await open(page, query);
  await page.getByTestId('init-audio').click();
  await ready(page);
}
async function ready(page: Page, buffers = 4) {
  await page.waitForFunction((n) => (window as any).__audio?.sound?.service.stats().buffers === n, buffers, {
    timeout: 20_000,
  });
}
const stats = (page: Page) => page.evaluate(() => (window as any).__audio.sound.service.stats());
const peak = (page: Page, ms = 300) => page.evaluate((m) => (window as any).__audio.peak(m) as Promise<number>, ms);
const handle = (page: Page, event: string, param?: string) =>
  page.evaluate(([e, p]) => (window as any).__audio.sound.manager.handle(e, p), [event, param] as const);
const listeners = (page: Page) => page.evaluate(() => ({ ...(window as any).__listeners }) as Record<string, number>);
const state = (page: Page) => page.getByTestId('state').textContent();

test.describe('Audio harness', () => {
  test('the audio code and the sound files load only when audio is used, and no Pixi comes with them', async ({
    page,
  }) => {
    const requested: string[] = [];
    page.on('request', (r) => requested.push(decodeURIComponent(new URL(r.url()).pathname)));
    const scripts = watchScripts(page);
    await open(page);
    await page.waitForLoadState('networkidle');
    expect(await scripts(AUDIO_CODE), 'audio code on first load').toEqual([]);
    expect(requested.filter((u) => /sounds\//.test(u))).toEqual([]);
    await page.getByTestId('init-audio').click();
    await ready(page);
    expect(await scripts(AUDIO_CODE), 'the audio chunk').toHaveLength(1);
    expect(requested.filter((u) => /sounds\/ogg\//.test(u))).toHaveLength(4);
    expect(
      requested.filter((u) => /sounds\/mp3\//.test(u)),
      'ogg is preferred, so no mp3',
    ).toEqual([]);
    expect(await scripts(SPINE_PIXI), 'no Pixi or Spine on an audio page').toEqual([]);
  });

  test('sound is locked until the first gesture, then a looping ambient track that was waiting starts', async ({
    page,
  }) => {
    await instrument(page);
    await open(page, '?autoinit=1'); // nobody has touched this page: the browser keeps its audio suspended
    await ready(page);
    expect((await stats(page)).state).toBe('suspended');
    expect(await state(page)).toContain('unlocked=false');
    const before = await listeners(page);
    expect(before['window:pointerdown'], 'unlock listeners are waiting').toBeGreaterThan(0);

    await handle(page, 'START'); // a sound effect asked for while locked is dropped
    await handle(page, 'AMBIENT'); // a looping ambient track waits
    expect(await stats(page)).toMatchObject({ playing: 0, pendingAmbient: LOOP });

    await page.mouse.click(5, 5); // the first gesture
    await expect.poll(async () => (await stats(page)).state).toBe('running');
    expect(await stats(page)).toMatchObject({ unlocked: true, playing: 1, ambient: LOOP, pendingAmbient: undefined });
    expect(await peak(page), 'the waiting ambient track is audible').toBeGreaterThan(LOUD);
    const after = await listeners(page);
    for (const type of ['pointerdown', 'keydown', 'touchend'])
      expect(after[`window:${type}`], `${type} unlock listener removed`).toBeLessThan(before[`window:${type}`]);
  });

  test('a key press unlocks too, and a resume that fails keeps the listeners so the next gesture retries', async ({
    page,
  }) => {
    await instrument(page);
    await page.addInitScript(() => ((window as any).__failResume = 1));
    await open(page, '?autoinit=1');
    await ready(page);
    const listening = (await listeners(page))['window:pointerdown'];
    await page.mouse.click(5, 5); // the first resume is refused
    await page.waitForTimeout(300);
    expect((await stats(page)).state, 'still locked').toBe('suspended');
    expect((await stats(page)).unlocked).toBe(false);
    expect((await listeners(page))['window:pointerdown'], 'listeners kept').toBe(listening);
    await page.keyboard.press('Shift'); // the next gesture, a key this time, retries and succeeds
    await expect.poll(async () => (await stats(page)).state).toBe('running');
    expect((await stats(page)).unlocked).toBe(true);
    expect((await listeners(page))['window:keydown']).toBeLessThan(listening + 1);
    await handle(page, 'START');
    expect(await peak(page)).toBeGreaterThan(LOUD);
  });

  test('playing: audible, retrigger stops the old one, overlap, matchParam, ambient is exclusive and loops, fades end in silence', async ({
    page,
  }) => {
    await start(page);
    expect(await peak(page, 150), 'silent before anything plays').toBeLessThanOrEqual(SILENT);

    await handle(page, 'START');
    expect(await peak(page)).toBeGreaterThan(LOUD);
    await handle(page, 'START');
    expect((await stats(page)).playing, 'a retrigger leaves one instance').toBe(1);

    await page.evaluate(() => (window as any).__audio.sound.service.stopAll());
    await handle(page, 'MATCH', 'yes');
    await handle(page, 'MATCH', 'yes');
    expect((await stats(page)).playing, 'dontStopInstances lets them overlap').toBe(2);
    await handle(page, 'MATCH', 'no');
    expect((await stats(page)).playing, 'the wrong matchParam plays nothing').toBe(2);
    await page.evaluate(() => (window as any).__audio.sound.service.stopAll());

    await handle(page, 'AMBIENT');
    await handle(page, 'AMBIENT');
    expect(await stats(page)).toMatchObject({ playing: 1, ambient: LOOP });
    await handle(page, 'AMBIENT_TWO');
    expect(await stats(page), 'another ambient track replaces it').toMatchObject({ playing: 1, ambient: TWO });
    await handle(page, 'AMBIENT');
    expect((await stats(page)).ambient).toBe(LOOP);

    // it loops: still playing after one full pass of the file
    const seconds = await page.evaluate(
      (n) => (window as any).__audio.sound.service.buffers.get(n).duration as number,
      LOOP,
    );
    await page.waitForTimeout(Math.min(seconds, 6) * 1000 + 400);
    expect((await stats(page)).ambient).toBe(LOOP);
    expect(await peak(page)).toBeGreaterThan(LOUD);

    // stopping fades out (300 ms) to silence
    await handle(page, 'AMBIENT_OFF');
    expect((await stats(page)).playing).toBe(0);
    await page.waitForTimeout(700);
    expect(await peak(page, 200)).toBeLessThanOrEqual(SILENT);

    await handle(page, 'START');
    await handle(page, 'STOP');
    await page.waitForTimeout(500);
    expect(await peak(page, 150), 'a stop event silences it').toBeLessThanOrEqual(SILENT);
  });

  test('React controls: mute, volume, sound effects and ambient change what is heard', async ({ page }) => {
    await start(page);
    await handle(page, 'AMBIENT');
    await page.waitForTimeout(400); // past the fade in
    const full = await peak(page);
    expect(full).toBeGreaterThan(LOUD);

    await page.getByTestId('mute').click();
    await expect(page.getByTestId('mute')).toHaveAttribute('aria-pressed', 'true');
    await page.waitForTimeout(250);
    expect(await peak(page, 200), 'muted').toBeLessThanOrEqual(SILENT);
    await page.getByTestId('mute').click();
    await page.waitForTimeout(250);
    expect(await peak(page)).toBeGreaterThan(full * 0.7);

    await page.getByTestId('volume').fill('0.5');
    await page.waitForTimeout(250);
    const half = await peak(page);
    expect(half).toBeGreaterThan(full * 0.3);
    expect(half).toBeLessThan(full * 0.75);

    await page.getByTestId('ambient').click(); // ambient group off
    await page.waitForTimeout(250);
    expect(await peak(page, 200)).toBeLessThanOrEqual(SILENT);
    await page.getByTestId('ambient').click();
    await handle(page, 'AMBIENT_OFF');
    await page.waitForTimeout(500);

    await page.getByTestId('sfx').click(); // sound effects off
    await handle(page, 'START');
    await page.waitForTimeout(250);
    expect(await peak(page, 200), 'effects off').toBeLessThanOrEqual(SILENT);
    await page.getByTestId('sfx').click();
    await handle(page, 'START');
    expect(await peak(page)).toBeGreaterThan(LOUD * 0.5);
  });

  test('settings are kept across a reload; with storage blocked they work for the session and reset on reload', async ({
    page,
    browser,
  }) => {
    await start(page, '?key=audiotest1');
    await page.getByTestId('mute').click();
    await page.getByTestId('volume').fill('0.3');
    await expect.poll(() => state(page)).toContain('muted=true');
    await page.reload();
    await page.getByTestId('init-audio').click();
    await page.waitForFunction(() => !!(window as any).__audio?.sound);
    expect(await state(page)).toContain('muted=true');
    expect(await state(page)).toContain('volume=0.30');

    const blocked = await browser.newPage();
    await blocked.addInitScript(() => {
      const fail = () => {
        throw new DOMException('blocked', 'SecurityError');
      };
      Storage.prototype.setItem = fail;
      Storage.prototype.getItem = fail;
    });
    await start(blocked, '?key=audiotest2');
    await blocked.getByTestId('mute').click();
    await blocked.getByTestId('volume').fill('0.3');
    await expect.poll(() => state(blocked)).toContain('muted=true'); // works this session
    expect(await state(blocked)).toContain('volume=0.30');
    await blocked.reload();
    await blocked.getByTestId('init-audio').click();
    await blocked.waitForFunction(() => !!(window as any).__audio?.sound);
    expect(await state(blocked), 'defaults after a reload').toContain('muted=false');
    expect(await state(blocked)).toContain('volume=1.00');
    await blocked.close();
  });

  test('a hidden tab suspends the sound and returning resumes it; a muted user stays muted', async ({ page }) => {
    await start(page);
    await handle(page, 'AMBIENT');
    await page.waitForTimeout(400);
    const setHidden = (hidden: boolean) =>
      page.evaluate((h) => {
        Object.defineProperty(document, 'hidden', { configurable: true, get: () => h });
        document.dispatchEvent(new Event('visibilitychange'));
      }, hidden);
    await setHidden(true);
    await expect.poll(async () => (await stats(page)).state).toBe('suspended');
    await setHidden(false);
    await expect.poll(async () => (await stats(page)).state).toBe('running');
    expect((await stats(page)).playing, 'nothing replayed or dropped').toBe(1);
    expect(await peak(page)).toBeGreaterThan(LOUD);

    await page.getByTestId('mute').click();
    await setHidden(true);
    await setHidden(false);
    await page.waitForTimeout(300);
    expect(await peak(page, 200), 'still muted after coming back').toBeLessThanOrEqual(SILENT);
  });

  test('a file that cannot be loaded is retried once and stays silent without an error; an undecodable one too', async ({
    page,
  }) => {
    const seen = watch(page);
    const requested: string[] = [];
    page.on('request', (r) => requested.push(decodeURIComponent(new URL(r.url()).pathname)));
    await page.route(/Matchmaking_Start(%20| )Button.ogg/, (route) => route.fulfill({ status: 404 }));
    await page.route(/Matchmaking_Whoosh(%20| )in.ogg/, (route) =>
      route.fulfill({ status: 200, contentType: 'audio/ogg', body: 'this is not audio' }),
    );
    await open(page);
    await page.getByTestId('init-audio').click();
    await page.waitForFunction(() => (window as any).__audio?.sound?.service.stats().failed.length === 2, null, {
      timeout: 30_000,
    });
    expect(
      requested.filter((u) => u.endsWith(`${START}.ogg`)),
      'one try and one retry',
    ).toHaveLength(2);
    expect((await stats(page)).buffers, 'the other two loaded').toBe(2);
    await handle(page, 'START'); // silent, no exception
    await handle(page, 'MATCH', 'yes');
    expect((await stats(page)).playing).toBe(0);
    await handle(page, 'AMBIENT'); // the working one still plays
    expect((await stats(page)).playing).toBe(1);
    const warnings = seen.messages.filter((m) => /could not be loaded/.test(m));
    expect(warnings, 'one warning per sound').toHaveLength(2);
  });

  test('the format follows what the browser plays: ogg first, mp3 when ogg is not supported', async ({ page }) => {
    const requested: string[] = [];
    page.on('request', (r) => requested.push(decodeURIComponent(new URL(r.url()).pathname)));
    await page.addInitScript(() => {
      const original = HTMLMediaElement.prototype.canPlayType;
      HTMLMediaElement.prototype.canPlayType = function (type: string) {
        return /ogg/.test(type) ? '' : original.call(this, type);
      };
    });
    await start(page);
    expect(requested.filter((u) => /sounds\/mp3\/.*\.mp3$/.test(u))).toHaveLength(4);
    expect(requested.filter((u) => /sounds\/ogg\//.test(u))).toEqual([]);
    await handle(page, 'START');
    expect(await peak(page)).toBeGreaterThan(LOUD);
  });

  test('removing the audio 20 times leaves no listeners, closes every context and plays nothing afterwards', async ({
    page,
  }) => {
    await instrument(page);
    await start(page);
    await page.getByTestId('dispose-audio').click();
    const baseline = await listeners(page);
    for (let i = 0; i < 20; i++) {
      await page.getByTestId('init-audio').click();
      await ready(page);
      await handle(page, 'START');
      await handle(page, 'AMBIENT');
      await page.evaluate(() => ((window as any).__kept = (window as any).__audio.sound.service));
      await page.getByTestId('dispose-audio').click();
      await page.waitForFunction(() => (window as any).__ac.created() === (window as any).__ac.closed());
    }
    const after = await listeners(page);
    for (const key of Object.keys(after))
      expect(after[key], `net listeners of ${key}`).toBeLessThanOrEqual(baseline[key] ?? 0);
    expect(await page.evaluate(() => (window as any).__ac.created()), 'a context per cycle, plus the first').toBe(21);
    expect(await page.evaluate(() => (window as any).__ac.closed())).toBe(21);

    // after dispose the service does nothing and tells nobody
    const result = await page.evaluate(() => {
      const service = (window as any).__kept;
      let calls = 0;
      service.subscribe(() => calls++);
      service.setMuted(true);
      return { played: service.playSound('Matchmaking_Start Button'), calls, stats: service.stats() };
    });
    expect(result.played).toBeUndefined();
    expect(result.calls).toBe(0);
    expect(result.stats).toMatchObject({ playing: 0, state: 'none', buffers: 0 });
  });
});
