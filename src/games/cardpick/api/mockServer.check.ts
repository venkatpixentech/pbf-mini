// Self-check for the Card Pick mock backend. Run with `npm run check` (Node strips the types).
import assert from 'node:assert/strict';

import { createMockServer, PAYOUT_MULTIPLIER, RTP, STAKES } from './mockServer.ts';

let seed = 42;
const random = () => (seed = (seed * 1664525 + 1013904223) % 2 ** 32) / 2 ** 32;

// stakes and picks are validated and the wallet is protected
const api = createMockServer({ latencyMs: 0, random });
await assert.rejects(api.play(3, 0), { code: 'INVALID_STAKE' });
await assert.rejects(api.play(1, 3), { code: 'INVALID_PICK' });
await assert.rejects(api.play(1, -1), { code: 'INVALID_PICK' });
await assert.rejects(api.play(1, 0.5), { code: 'INVALID_PICK' });
const start = (await api.init()).balance;
assert.equal(start, 1000, 'a rejected play takes no stake');

// the stake is taken, the server picks the winner, and only the winning pick is paid
let staked = 0;
let returned = 0;
let balance = start;
const winners = [0, 0, 0];
for (let i = 0; i < 6000; i++) {
  const pick = i % 3;
  const r = await api.play(STAKES[0], pick);
  staked += STAKES[0];
  returned += r.payout;
  winners[r.winningIndex]++;
  balance = Math.round((balance - STAKES[0] + r.payout) * 100) / 100;
  assert.equal(r.balance, balance, 'server balance matches stake minus payout');
  assert.equal(r.pick, pick);
  assert.equal(r.won, r.winningIndex === pick);
  assert.equal(r.payout > 0, r.won);
  if (r.won) assert.equal(r.payout, Math.round(STAKES[0] * PAYOUT_MULTIPLIER * 100) / 100);
}
const rtp = returned / staked;
assert.ok(rtp > RTP - 0.08 && rtp < RTP + 0.08, `simulated RTP ${rtp}`);
for (const n of winners) assert.ok(n > 1700 && n < 2300, `each card wins about a third of the time (${winners})`);

// an empty wallet rejects play
const poor = createMockServer({ latencyMs: 0, random: () => 0.99 });
for (let i = 0; i < 100; i++) await poor.play(20, 0).catch(() => undefined);
await assert.rejects(poor.play(20, 0), { code: 'INSUFFICIENT_BALANCE' });

// a failing init is reported with its code
await assert.rejects(createMockServer({ latencyMs: 0, initError: 'MAINTENANCE' }).init(), { code: 'MAINTENANCE' });

console.log(`cardpick mockServer.check: ok (simulated RTP ${rtp.toFixed(4)})`);
