// npm run new-game <id> "<Game Title>" [-- --scene] [--sound]   (id: lowercase letters and digits only)
// Creates src/games/<id> with a working placeholder game (mock backend, self-check, screen),
// registers its self-check in package.json, and formats it. Replace the placeholder play() rules
// with the real game (docs/03-GAME-DEVELOPMENT-GUIDE.md).
//   (no flag)  React only: no Pixi, no audio.
//   --scene    adds a Pixi scene: pixi/config/game.config.ts, pixi/config/config.check.ts, pixi/view/<Name>Scene.ts, and the
//              screen draws it in a <PixiStage critical>. The game's renderer becomes 'pixi'.
//   --sound    adds audio: sound/sound.config.ts, sound/sound.check.ts, public/assets/<id>/sounds/, and the screen plays sounds
//              through useSound and shows a React mute button. Works with or without --scene (audio never needs Pixi).
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith('--')));
for (const flag of flags) {
  if (flag !== '--scene' && flag !== '--sound') {
    console.error(`Unknown option ${flag}. Options: --scene, --sound`);
    process.exit(1);
  }
}
const scene = flags.has('--scene');
const sound = flags.has('--sound');
const [id, ...titleParts] = args.filter((a) => !a.startsWith('--'));
const title = titleParts.join(' ') || id;
if (!id || !/^[a-z][a-z0-9]*$/.test(id)) {
  console.error(
    'Usage: npm run new-game <id> "<Game Title>" [-- --scene] [--sound]   (id: lowercase letters and digits only, e.g. new-game penaltyshootout "Penalty Shootout")',
  );
  process.exit(1);
}
if (/['"`\$]/.test(title)) {
  console.error('Title must not contain quotes, backticks, backslashes or $ (it is written into source files)');
  process.exit(1);
}
const dir = `src/games/${id}`;
if (existsSync(dir)) {
  console.error(`${dir} already exists`);
  process.exit(1);
}

// component name from the title ("Penalty Shootout" -> PenaltyShootout), falling back to the id
const Pascal =
  title
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join('') || id[0].toUpperCase() + id.slice(1);
const fill = (text) => text.replaceAll('__ID__', id).replaceAll('__TITLE__', title).replaceAll('__PASCAL__', Pascal);

// The optional parts. Each placeholder in the base files below is replaced by its piece when the flag is on, or by nothing.
const pieces = {
  __SCENE_IMPORT__: scene ? "import { __ID__PixiConfig } from './pixi/config/game.config';\n" : '',
  __RENDERER__: scene ? 'pixi' : 'dom',
  __PRELOAD__: scene ? '__ID__PixiConfig.preload' : '[]',
  __SOUND_IMPORT__: sound ? "\nimport { useSound, useSoundSettings } from 'core/audio/react';" : '',
  __SCENE_SCREEN_IMPORT__: scene
    ? "import { CanvasFrame } from 'core/pixi/CanvasFrame';\nimport { PixiStage } from 'core/pixi/PixiStage';\n"
    : '',
  __LOCAL_IMPORTS__:
    (scene
      ? "import { __ID__Canvas } from './pixi/config/game.config';\nimport { __PASCAL__Scene } from './pixi/view/__PASCAL__Scene';\n"
      : '') + (sound ? "import { __ID__Sounds } from './sound/sound.config';\n" : ''),
  __SOUND_HOOKS__: sound
    ? "  // Audio is optional and lazy: useSound loads the sound code and files after the screen, and unlocks on the first tap or key.\n  const sound = useSound(__ID__Sounds, { storageKey: '__ID__.sound' });\n  const settings = useSoundSettings(sound?.service ?? null);\n"
    : '',
  __SOUND_PLAY__: sound ? "      sound?.manager.handle('PLAY');\n" : '',
  __SCENE_STAGE__: scene
    ? "          <CanvasFrame config={__ID__Canvas} fill className=\"__ID__-canvas\">\n            <PixiStage critical scene={createScene} props={{ result: last ? (last.won ? 'won' : 'lost') : null }} />\n          </CanvasFrame>\n"
    : '',
  __SOUND_BUTTON__: sound
    ? "          <button className=\"pbf-btn\" aria-pressed={!!settings?.muted} onClick={() => sound?.service.setMuted(!settings?.muted)}>\n            {settings?.muted ? 'Sound off' : 'Sound on'}\n          </button>\n"
    : '',
};
const withPieces = (text) => Object.entries(pieces).reduce((t, [key, value]) => t.replaceAll(key, value), text);

const files = {
  'index.ts': `// Game entry: the only file the core reads. Everything else in this folder belongs to the game.
// Keep imports here light: this file is in the boot bundle. The screen loads through loadScreen.
import { defineGame } from 'core/game/defineGame';
import { mockInitError } from 'core/services/mockTransport';

import { createMockServer } from './api/mockServer';
__SCENE_IMPORT__
export default defineGame({
  id: '__ID__',
  title: '__TITLE__',
  // 'pixi' when the first screen has a <PixiStage critical>; 'dom' keeps Pixi out of the boot entirely
  renderer: '__RENDERER__',
  preload: __PRELOAD__, // Pixi assets needed by the first screen
  // MOCK: replace with the real backend client once the contract exists (docs/09-BACKEND-INTEGRATION.md, Q1).
  createApi: (launch) => createMockServer({ currency: launch.currency ?? 'GBP', initError: mockInitError() }),
  loadScreen: () => import('./__PASCAL__Screen').then((m) => m.__PASCAL__Screen),
});
`,
  '__ID__.css': `/* GameLayout root: the smallest height the game can be played in (see docs/06-RESPONSIVE-GAME-LAYOUT.md) */
.__ID__ {
  --pbf-play-min: 320px;
}
.__ID__-stage {
  height: 100%;
  display: grid;
  place-items: center;
}
.__ID__-result {
  padding: 16px;
  text-align: center;
  font: 900 22px/1.2 var(--font-display);
  text-transform: uppercase;
}
.__ID__-result.won {
  color: var(--status-win);
}
.__ID__-result.lost {
  color: var(--status-loss);
}
`,
  '__PASCAL__Screen.tsx': `import './__ID__.css';

import { useState } from 'react';
__SOUND_IMPORT__
import type { GameScreenProps } from 'core/game/defineGame';
import { useApiMessage } from 'core/hooks/useApiMessage';
__SCENE_SCREEN_IMPORT__import { formatMoney } from 'core/services/money';
import { GameHeader } from 'core/ui/GameHeader';
import { GameLayout } from 'core/ui/GameLayout';
import { StakeChips } from 'core/ui/StakeChips';

import type { InitResponse, PlayResponse, __PASCAL__Api } from './api/types';
__LOCAL_IMPORTS__
const ERROR_TEXT: Record<string, string> = {
  INSUFFICIENT_BALANCE: 'Not enough balance for that stake.',
  INVALID_STAKE: 'That stake is not allowed.',
};

/** Placeholder screen: React owns UI, state and API calls. Replace with the real game. */
export function __PASCAL__Screen({ api, init }: GameScreenProps<__PASCAL__Api, InitResponse>) {
  const { currency, stakes } = init;
  const [balance, setBalance] = useState(init.balance);
  const [stake, setStake] = useState(stakes[0]);
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState<PlayResponse | null>(null);
  const { message, setMessage, fail } = useApiMessage(ERROR_TEXT);
__SOUND_HOOKS__
  const play = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const r = await api.play(stake);
      setBalance(r.balance);
      setLast(r);
__SOUND_PLAY__    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  // Compact layout (docs/06-RESPONSIVE-GAME-LAYOUT.md): header + stage + controls fit in about half the
  // screen and never scroll; rules, history and feeds go in info.
  return (
    <GameLayout
      className="__ID__"
      header={<GameHeader title="__TITLE__" balance={balance} currency={currency} />}
      stage={
        <div className="__ID__-stage">
__SCENE_STAGE__          {last && (
            <p className={\`__ID__-result \${last.won ? 'won' : 'lost'}\`} role="status">
              {last.won ? \`You won \${formatMoney(last.payout, currency)}\` : 'No win this time'}
            </p>
          )}
        </div>
      }
      controls={
        <>
          <StakeChips stakes={stakes} value={stake} onChange={setStake} currency={currency} disabled={busy} />
          <button className="pbf-btn" disabled={busy} onClick={play}>
            {busy ? 'Playing...' : 'Play'}
          </button>
          {message && <p className="pbf-footer-note">{message}</p>}
__SOUND_BUTTON__        </>
      }
      info={<p className="pbf-footer-note">Mock backend: outcomes and balance are simulated. 18+</p>}
    />
  );
}
`,
  'api/types.ts': `// __TITLE__ backend contract. The mock server implements it today; the real backend must implement
// the same shapes. The client never decides outcomes, prices or balance.
import type { SessionErrorCode } from '../../../core/services/apiError.ts';

export type InitResponse = { balance: number; currency: string; stakes: number[] };
export type PlayResponse = { won: boolean; payout: number; balance: number };

export type ApiErrorCode = SessionErrorCode | 'INSUFFICIENT_BALANCE' | 'INVALID_STAKE';
export { ApiError } from '../../../core/services/apiError.ts';

export interface __PASCAL__Api {
  init(): Promise<InitResponse>;
  play(stake: number): Promise<PlayResponse>;
}
`,
  'api/mockServer.ts': `// MOCK BACKEND for __TITLE__. Stands in for the real server until its contract exists (docs/09-BACKEND-INTEGRATION.md, Q1).
// It owns the wallet and every outcome, exactly as the real server must; the UI only renders responses.
import type { SessionErrorCode } from '../../../core/services/apiError.ts';
import { mockTransport } from '../../../core/services/mockTransport.ts';
import { roundMoney } from '../../../core/services/money.ts';
import type { __PASCAL__Api } from './types.ts';

export const RTP = 0.96;
export const WIN_PROBABILITY = 0.48;
export const PAYOUT_MULTIPLIER = RTP / WIN_PROBABILITY;
export const STAKES = [1, 2, 5, 10, 20];

type Options = { latencyMs?: number; random?: () => number; currency?: string; initError?: SessionErrorCode | null };

export function createMockServer({
  latencyMs = 150,
  random = Math.random,
  currency = 'GBP',
  initError = null,
}: Options = {}): __PASCAL__Api {
  let balance = 1000;
  const { reply, fail } = mockTransport(latencyMs);

  return {
    init() {
      if (initError) return fail(initError);
      return reply({ balance, currency, stakes: STAKES });
    },

    play(stake) {
      if (!STAKES.includes(stake)) return fail('INVALID_STAKE');
      if (roundMoney(stake) > roundMoney(balance)) return fail('INSUFFICIENT_BALANCE');
      balance = roundMoney(balance - stake);
      const won = random() < WIN_PROBABILITY;
      const payout = won ? roundMoney(stake * PAYOUT_MULTIPLIER) : 0;
      balance = roundMoney(balance + payout);
      return reply({ won, payout, balance });
    },
  };
}
`,
  'api/mockServer.check.ts': `// Self-check for the __TITLE__ mock backend. Run with \`npm run check\` (Node strips the types).
import assert from 'node:assert/strict';

import { createMockServer, RTP, STAKES } from './mockServer.ts';

let seed = 42;
const random = () => (seed = (seed * 1664525 + 1013904223) % 2 ** 32) / 2 ** 32;

// stakes are validated and the wallet is protected
const api = createMockServer({ latencyMs: 0, random });
await assert.rejects(api.play(3), { code: 'INVALID_STAKE' });
const start = (await api.init()).balance;
assert.equal(start, 1000);

// the stake is taken and a win pays out; a loss does not
let staked = 0;
let returned = 0;
let balance = start;
for (let i = 0; i < 5000; i++) {
  const r = await api.play(STAKES[0]);
  staked += STAKES[0];
  returned += r.payout;
  balance = Math.round((balance - STAKES[0] + r.payout) * 100) / 100;
  assert.equal(r.balance, balance, 'server balance matches stake minus payout');
  assert.equal(r.won, r.payout > 0);
}
const rtp = returned / staked;
assert.ok(rtp > RTP - 0.08 && rtp < RTP + 0.08, \`simulated RTP \${rtp}\`);

// an empty wallet rejects play
const poor = createMockServer({ latencyMs: 0, random: () => 0.99 });
for (let i = 0; i < 100; i++) await poor.play(20).catch(() => undefined);
await assert.rejects(poor.play(20), { code: 'INSUFFICIENT_BALANCE' });

// a failing init is reported with its code
await assert.rejects(createMockServer({ latencyMs: 0, initError: 'MAINTENANCE' }).init(), { code: 'MAINTENANCE' });

console.log(\`__ID__ mockServer.check: ok (simulated RTP \${rtp.toFixed(4)})\`);
`,
};

if (scene) {
  files['pixi/config/game.config.ts'] =
    `// Pixi config for __TITLE__: what the first screen preloads, the design size the scene lays out in, and the scene's elements.
// The scene (pixi/view/__PASCAL__Scene.ts) only builds these and reacts to its props. Replace the placeholder panel with the real art.
import type { PixiGameConfig } from 'core/pixi/GameConfigProxy';
import type { CanvasConfig, ElementConfig } from 'core/pixi/viewConfig';

export const __ID__PixiConfig = {
  preload: [], // critical assets of the first screen, for example { alias: 'badges', src: '__ID__/images/badges.json' }
  design: { width: 720, height: 360, fit: 'contain' },
} satisfies PixiGameConfig;

/** How much of the screen the canvas takes (a share of its height, kept between a minimum and a maximum, in px). */
export const __ID__Canvas: CanvasConfig = { heightPct: 30, minHeight: 160, maxHeight: 280 };

/** Placeholder art: one panel. The scene tints it on a result. */
export const __ID__Elements: ElementConfig[] = [
  {
    type: 'shape',
    id: 'panel',
    x: 360,
    y: 180,
    shape: 'roundRect',
    width: 520,
    height: 240,
    radius: 28,
    fill: 0x35507a,
    stroke: { width: 6, color: 'white' },
  },
];
`;
  files['pixi/config/config.check.ts'] =
    `// Self-check: node --experimental-strip-types --no-warnings src/games/__ID__/pixi/config/config.check.ts
// The game's Pixi config and its elements are valid.
import { validatePixiConfig } from '../../../../core/pixi/GameConfigProxy.ts';
import { validateCanvas, validateElements } from '../../../../core/pixi/viewConfig.ts';
import { __ID__Canvas, __ID__Elements, __ID__PixiConfig } from './game.config.ts';

validatePixiConfig(__ID__PixiConfig, '__ID__PixiConfig');
validateCanvas(__ID__Canvas, '__ID__Canvas');
validateElements(__ID__Elements, '__ID__Elements');

console.log('__ID__ config.check: ok');
`;
  files['pixi/view/__PASCAL__Scene.ts'] = `import { Container, type Graphics } from 'pixi.js';

import { buildElements } from 'core/pixi/buildView';
import { applyPlacement, stageFit } from 'core/pixi/layout';
import type { PixiScene, SceneContext } from 'core/pixi/scene';

import { __ID__Elements, __ID__PixiConfig } from '../config/game.config';

/** What React tells the scene. The scene never calls the backend and never decides an outcome. */
export type __PASCAL__SceneProps = { result: 'won' | 'lost' | null };

/** Placeholder scene: draws the config's elements and tints the panel by the result. Events go to React with ctx.emit. */
export class __PASCAL__Scene implements PixiScene<__PASCAL__SceneProps, never> {
  private root = new Container();

  init(ctx: SceneContext<never>, props: __PASCAL__SceneProps) {
    this.root.addChild(buildElements(__ID__Elements));
    ctx.root.addChild(this.root);
    this.update(props);
  }

  update(props: __PASCAL__SceneProps) {
    const panel = this.root.getChildByLabel('panel', true) as Graphics | null;
    if (panel) panel.tint = props.result === 'won' ? 0x66ee99 : props.result === 'lost' ? 0xee7777 : 0xffffff;
  }

  resize(width: number, height: number) {
    applyPlacement(this.root, stageFit(__ID__PixiConfig.design, { width, height }, __ID__PixiConfig.design.fit));
  }

  destroy() {}
}
`;
  files['__PASCAL__Screen.tsx'] = files['__PASCAL__Screen.tsx'].replace(
    '/** Placeholder screen:',
    'const createScene = () => new __PASCAL__Scene();\n\n/** Placeholder screen:',
  );
}
if (sound) {
  files['sound/sound.config.ts'] =
    `// Sounds for __TITLE__ (core/audio, loaded lazily by useSound; React owns the controls). Each entry is a file name without its
// extension: put <name>.mp3 in public/assets/__ID__/sounds/mp3/ and <name>.ogg in .../ogg/. The screen reports events with
// sound.manager.handle('PLAY'); an entry plays on the events in playEvents. Add the real sounds below.
import type { SoundGameConfig } from 'core/audio/SoundConfig';

export const __ID__Sounds = {
  soundPath: '__ID__/sounds/',
  soundFiles: [
    // { name: 'play', playEvents: ['PLAY'] },
  ],
} satisfies SoundGameConfig;
`;
  files['sound/sound.check.ts'] =
    `// Self-check: node --experimental-strip-types --no-warnings src/games/__ID__/sound/sound.check.ts
// The sound config is valid and every file it names exists in both formats.
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';

import { validateSoundConfig } from '../../../core/audio/SoundConfig.ts';
import { __ID__Sounds } from './sound.config.ts';

validateSoundConfig(__ID__Sounds, '__ID__Sounds');
for (const s of __ID__Sounds.soundFiles) {
  if (s.langEnabled) continue; // per-language variants are named <name><language>
  for (const ext of ['mp3', 'ogg']) {
    const path = __ID__Sounds.soundPath + ext + '/' + s.name + '.' + ext;
    assert.ok(existsSync(new URL('../../../../public/assets/' + path, import.meta.url)), 'missing sound file: ' + path);
  }
}

console.log('__ID__ sound.check: ok');
`;
}

for (const [name, content] of Object.entries(files)) {
  const path = `${dir}/${fill(name)}`;
  mkdirSync(path.slice(0, path.lastIndexOf('/')), { recursive: true });
  writeFileSync(path, fill(withPieces(content)));
}

// the game's own art folder (shared art stays in public/assets/common)
mkdirSync(`public/assets/${id}`, { recursive: true });
writeFileSync(`public/assets/${id}/.gitkeep`, '');
if (sound) for (const ext of ['mp3', 'ogg']) mkdirSync(`public/assets/${id}/sounds/${ext}`, { recursive: true });

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const registerCheck = (file) =>
  (pkg.scripts.check += ` && node --experimental-strip-types --no-warnings ${dir}/${file}`);
registerCheck('api/mockServer.check.ts');
if (scene) registerCheck('pixi/config/config.check.ts');
if (sound) registerCheck('sound/sound.check.ts');
writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');

execSync(`npx eslint --fix ${dir}`, { stdio: 'inherit' });
console.log(`
Created ${dir}. Next:
  npm run dev -- ${id}      open the placeholder game
  npm run check             structure rules + this game's mock backend self-check
Then replace the placeholder play() rules and screen (docs/03-GAME-DEVELOPMENT-GUIDE.md).${scene ? `\nScene: edit pixi/config/game.config.ts and pixi/view/${Pascal}Scene.ts.` : ''}${sound ? `\nSound: add files under public/assets/${id}/sounds/{mp3,ogg}/ and list them in sound/sound.config.ts.` : ''}`);
