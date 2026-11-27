// Card Pick, the fourth game: made with `npm run new-game cardpick "Card Pick" --scene --sound` and then filled in (Phase 8 proof).
// A canvas tap and the keyboard-accessible React button make the same pick with the same result; sound plays and mute silences it;
// the console stays clean; the game's code and art are in no other game's build, and no other game's in its build; and a DOM game
// (Last Man Standing) still loads no Pixi, Spine or audio code. Docs: docs/PBF-PIXI-CAPABILITY-MATRIX.md.
import { type Page, test } from '@playwright/test';

import { hasPath, textFiles } from './buildScan.mjs';
import { dismissIntro, expect, openGame, pageText, watch } from './helpers';

const SEED = '?mockSeed=11';
const resultText = (page: Page) => page.locator('.cardpick-result').innerText();
const balanceText = (page: Page) => page.locator('.pbf-header, header').first().innerText();

/** Where card `i` is on the page: the canvas box and the 720 x 360 design letterboxed into it (stageFit, contain). */
async function cardPoint(page: Page, i: number) {
  const box = (await page.locator('canvas').boundingBox())!;
  const scale = Math.min(box.width / 720, box.height / 360);
  const x = box.x + (box.width - 720 * scale) / 2 + (120 + 240 * i) * scale;
  const y = box.y + (box.height - 360 * scale) / 2 + 180 * scale;
  return { x, y };
}

/** What a play produced, once the server has answered: the result line and the balance. */
async function settled(page: Page) {
  await expect(page.locator('.cardpick-result')).not.toHaveText('', { timeout: 5000 });
  await expect(page.locator('.cardpick-picks button').first()).toBeEnabled();
  return { result: await resultText(page), header: await balanceText(page) };
}

test.describe('cardpick', () => {
  test('a canvas tap and the keyboard button make the same pick with the same result', async ({ page }) => {
    const seen = watch(page);
    // the same seed gives the same server draw: card 2 (index 1) by canvas tap, then card 2 by its React button
    await openGame(page, 'cardpick', SEED);
    await dismissIntro(page);
    const p = await cardPoint(page, 1);
    await page.mouse.click(p.x, p.y);
    const byTap = await settled(page);

    await openGame(page, 'cardpick', SEED);
    await page.getByRole('button', { name: 'Pick card 2' }).click();
    const byButton = await settled(page);

    expect(byTap.result).toBe(byButton.result);
    expect(byTap.header).toBe(byButton.header);
    expect(seen.failed).toEqual([]);
    expect(seen.messages).toEqual([]);
  });

  test('every card can be picked from the canvas and the server decides the result', async ({ page }) => {
    await openGame(page, 'cardpick', SEED);
    const results: string[] = [];
    for (let i = 0; i < 3; i++) {
      const p = await cardPoint(page, i);
      await page.mouse.click(p.x, p.y);
      results.push((await settled(page)).result);
    }
    for (const r of results) expect(r).toMatch(/you won|no win this time/i);
    // one card in three wins: with the seeded server three different picks of three rounds cannot all be wins
    expect(results.filter((r) => /^you won/i.test(r)).length).toBeLessThan(3);
  });

  test('while a pick is waiting for the server, a second tap or button press does nothing', async ({ page }) => {
    await openGame(page, 'cardpick', SEED);
    const before = await pageText(page);
    const p = await cardPoint(page, 0);
    await page.mouse.click(p.x, p.y);
    await expect(page.locator('.cardpick-picks button').first()).toBeDisabled();
    const q = await cardPoint(page, 2);
    await page.mouse.click(q.x, q.y); // ignored: the cards are disabled while the server answers
    await settled(page);
    expect(await pageText(page)).not.toBe(before);
    // exactly one stake was taken: 1000 - 1 (+ a possible win), never 1000 - 2
    const header = await balanceText(page);
    expect(header).not.toMatch(/998/);
  });

  test('a pick makes a sound, and mute silences it', async ({ page }) => {
    await page.addInitScript(() => {
      // a test analyser on everything that reaches the speakers: the master output, after mute and volume
      const w = window as unknown as { __peak: (ms: number) => Promise<number>; __plays: number };
      w.__plays = 0;
      const start = AudioBufferSourceNode.prototype.start;
      AudioBufferSourceNode.prototype.start = function (...a: Parameters<typeof start>) {
        w.__plays++;
        return start.apply(this, a);
      };
      let analyser: AnalyserNode | null = null;
      const connect = AudioNode.prototype.connect as (this: AudioNode, ...a: unknown[]) => unknown;
      AudioNode.prototype.connect = function (this: AudioNode, dest: unknown, ...rest: unknown[]) {
        if (dest instanceof AudioDestinationNode && !analyser) {
          analyser = dest.context.createAnalyser();
          analyser.fftSize = 512;
          connect.call(this, analyser);
        } else if (dest instanceof AudioDestinationNode && analyser) {
          connect.call(this, analyser);
        }
        return connect.call(this, dest, ...rest);
      } as typeof AudioNode.prototype.connect;
      w.__peak = async (ms) => {
        const data = new Uint8Array(512);
        let best = 0;
        const end = performance.now() + ms;
        while (performance.now() < end) {
          analyser?.getByteTimeDomainData(data);
          for (const v of data) best = Math.max(best, Math.abs(v - 128));
          await new Promise((r) => setTimeout(r, 10));
        }
        return best;
      };
    });
    const sounds: string[] = [];
    page.on('response', (r) => {
      if (/\/cardpick\/sounds\//.test(r.url())) sounds.push(new URL(r.url()).pathname);
    });
    await openGame(page, 'cardpick', SEED);
    await expect.poll(() => sounds.length, { timeout: 10_000 }).toBeGreaterThanOrEqual(2); // both files, in one format
    await page.waitForTimeout(500); // decoded

    const peak = page.evaluate(() => (window as unknown as { __peak: (ms: number) => Promise<number> }).__peak(1500));
    await page.getByRole('button', { name: 'Pick card 1' }).click();
    expect(await peak, 'a pick is audible').toBeGreaterThan(5);
    expect(await page.evaluate(() => (window as unknown as { __plays: number }).__plays)).toBeGreaterThanOrEqual(1);
    await settled(page);

    await page.getByRole('button', { name: 'Sound on' }).click();
    await expect(page.getByRole('button', { name: 'Sound off' })).toHaveAttribute('aria-pressed', 'true');
    await page.waitForTimeout(600); // the earlier reveal sound's tail is gone and the output has settled to silence
    const silent = page.evaluate(() => (window as unknown as { __peak: (ms: number) => Promise<number> }).__peak(1500));
    await page.getByRole('button', { name: 'Pick card 3' }).click();
    expect(await silent, 'muted: silence').toBeLessThanOrEqual(1);
    await settled(page);

    // the choice is remembered across a reload
    await openGame(page, 'cardpick', SEED);
    await expect(page.getByRole('button', { name: 'Sound off' })).toBeVisible();
  });

  test('audio code and the sound files are fetched with the game screen, never before', async ({ page }) => {
    const requests: string[] = [];
    page.on('request', (r) => requests.push(new URL(r.url()).pathname));
    await page.goto('/cardpick/');
    await page.locator('.pbf-layout').waitFor();
    expect(requests.some((u) => /\/sounds\//.test(u))).toBe(true);
    const first = requests.findIndex((u) => /\/sounds\//.test(u));
    const screen = requests.findIndex((u) => /CardPickScreen-.*\.js$/.test(u));
    expect(screen).toBeGreaterThanOrEqual(0);
    expect(first).toBeGreaterThan(screen);
  });
});

// ---- isolation ---------------------------------------------------------------------------------------------------

test.describe('isolation', () => {
  test("Card Pick's code and art are in no other game's build, and no other game's are in its build", async () => {
    const others = ['higherlower', 'accacrash', 'lastmanstanding'];
    for (const id of others) {
      expect(hasPath(id, 'assets/cardpick'), `${id} ships cardpick art`).toBe(false);
      for (const { file, code } of textFiles(id)) {
        expect(code.includes('cardpick'), `${id}/${file} mentions cardpick`).toBe(false);
        expect(/CardPickScene|cardpickPixiConfig/.test(code), `${id}/${file} has Card Pick code`).toBe(false);
      }
    }
    expect(hasPath('cardpick', 'assets/cardpick/sounds'), 'cardpick ships its sounds').toBe(true);
    for (const id of others) {
      expect(hasPath('cardpick', `assets/${id}`), `cardpick ships ${id} art`).toBe(false);
      for (const { file, code } of textFiles('cardpick')) {
        expect(new RegExp(`\\b${id}\\b`).test(code), `cardpick/${file} mentions ${id}`).toBe(false);
      }
    }
  });

  test('a DOM game and a Pixi game without sound load no audio code; a DOM game loads no Pixi or Spine code', async ({
    page,
  }) => {
    const scripts: Array<{ url: string; code: string }> = [];
    page.on('response', async (r) => {
      if (r.request().resourceType() === 'script') scripts.push({ url: r.url(), code: await r.text().catch(() => '') });
    });
    const audio = (c: string) => /AudioContext/.test(c) && /createGain/.test(c);
    const pixi = (c: string) => /PixiJS|pixijs\.com/.test(c);
    const spine = (c: string) => /SkeletonJson/.test(c) && /AnimationState/.test(c);

    await openGame(page, 'lastmanstanding');
    expect(scripts.length).toBeGreaterThan(0);
    expect(
      scripts.filter((s) => audio(s.code)).map((s) => s.url),
      'LMS audio',
    ).toEqual([]);
    expect(
      scripts.filter((s) => pixi(s.code)).map((s) => s.url),
      'LMS pixi',
    ).toEqual([]);
    expect(
      scripts.filter((s) => spine(s.code)).map((s) => s.url),
      'LMS spine',
    ).toEqual([]);

    scripts.length = 0;
    await openGame(page, 'higherlower');
    expect(scripts.some((s) => pixi(s.code))).toBe(true);
    expect(
      scripts.filter((s) => audio(s.code)).map((s) => s.url),
      'higherlower audio',
    ).toEqual([]);
    expect(
      scripts.filter((s) => spine(s.code)).map((s) => s.url),
      'higherlower spine',
    ).toEqual([]);

    scripts.length = 0;
    await openGame(page, 'cardpick');
    expect(scripts.some((s) => pixi(s.code))).toBe(true);
    expect(scripts.some((s) => audio(s.code))).toBe(true);
    expect(
      scripts.filter((s) => spine(s.code)).map((s) => s.url),
      'cardpick spine',
    ).toEqual([]);
  });
});
