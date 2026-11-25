// npm run new-game <id> "<Game Title>"   (id: lowercase letters and digits only)
// Creates src/games/<id> with a working placeholder game (mock backend, self-check, screen),
// registers its self-check in package.json, and formats it. Replace the placeholder play() rules
// with the real game (docs/03-GAME-DEVELOPMENT-GUIDE.md).
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const [id, ...titleParts] = process.argv.slice(2);
const title = titleParts.join(' ') || id;
if (!id || !/^[a-z][a-z0-9]*$/.test(id)) {
  console.error(
    'Usage: npm run new-game <id> "<Game Title>"   (id: lowercase letters and digits only, e.g. new-game penaltyshootout "Penalty Shootout")',
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

const files = {
  'index.ts': `// Game entry: the only file the core reads. Everything else in this folder belongs to the game.
// Keep imports here light: this file is in the boot bundle. The screen loads through loadScreen.
import { defineGame } from 'core/game/defineGame';
import { mockInitError } from 'core/services/mockTransport';

import { createMockServer } from './api/mockServer';

export default defineGame({
  id: '__ID__',
  title: '__TITLE__',
  // 'pixi' when the first screen has a <PixiStage critical>; 'dom' keeps Pixi out of the boot entirely
  renderer: 'dom',
  preload: [], // Pixi assets needed by the first screen
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

import type { GameScreenProps } from 'core/game/defineGame';
import { useApiMessage } from 'core/hooks/useApiMessage';
import { formatMoney } from 'core/services/money';
import { GameHeader } from 'core/ui/GameHeader';
import { GameLayout } from 'core/ui/GameLayout';
import { StakeChips } from 'core/ui/StakeChips';

import type { InitResponse, PlayResponse, __PASCAL__Api } from './api/types';

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

  const play = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const r = await api.play(stake);
      setBalance(r.balance);
      setLast(r);
    } catch (e) {
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
          {last && (
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
        </>
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

for (const [name, content] of Object.entries(files)) {
  const path = `${dir}/${fill(name)}`;
  mkdirSync(path.slice(0, path.lastIndexOf('/')), { recursive: true });
  writeFileSync(path, fill(content));
}

// the game's own art folder (shared art stays in public/assets/common)
mkdirSync(`public/assets/${id}`, { recursive: true });
writeFileSync(`public/assets/${id}/.gitkeep`, '');

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
pkg.scripts.check += ` && node --experimental-strip-types --no-warnings ${dir}/api/mockServer.check.ts`;
writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');

execSync(`npx eslint --fix ${dir}`, { stdio: 'inherit' });
console.log(`
Created ${dir}. Next:
  npm run dev -- ${id}      open the placeholder game
  npm run check             structure rules + this game's mock backend self-check
Then replace the placeholder play() rules and screen (docs/03-GAME-DEVELOPMENT-GUIDE.md).`);
