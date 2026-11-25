// Self-check: node --experimental-strip-types --no-warnings src/games/higherlower/api/mockServer.check.ts
import assert from 'node:assert/strict';

import { MOCK_PLAYERS } from './mockData.ts';
import { createMockServer, marketsFor, RTP, winProbability, wins } from './mockServer.ts';
import { ApiError } from './types.ts';

// settlement rule
assert.equal(wins('H1', 80, 81), true);
assert.equal(wins('H1', 80, 80), false, 'a tie loses Higher');
assert.equal(wins('L1', 80, 80), false, 'a tie loses Lower');
assert.equal(wins('H3', 80, 83), true);
assert.equal(wins('H3', 80, 82), false);
assert.equal(wins('L2', 80, 78), true);

// prices: price * p never exceeds RTP and is within one floor step of it
for (const card of MOCK_PLAYERS) {
  for (const m of marketsFor(card)) {
    if (!m.available) continue;
    const ret = m.price * winProbability(m.id, card);
    assert.ok(ret <= RTP + 1e-9 && ret > RTP - 0.01, `${card.ovr} ${m.id} return ${ret}`);
  }
}
const lowest = MOCK_PLAYERS[0];
assert.equal(marketsFor(lowest).find((m) => m.id === 'L1')!.available, false, 'Lower is unavailable on the lowest OVR');

// deterministic random (LCG) so the run is repeatable
let seed = 42;
const random = () => (seed = (seed * 1664525 + 1013904223) % 2 ** 32) / 2 ** 32;

// errors at the trust boundary
const api = createMockServer({ latencyMs: 0, random });
const init = await api.init();
const open = init.round.markets.find((m) => m.available)!.id;
const closed = init.round.markets.find((m) => !m.available);
await assert.rejects(api.pick('stale', open, 1), (e: unknown) => e instanceof ApiError && e.code === 'ROUND_CLOSED');
await assert.rejects(
  api.pick(init.round.id, open, 3),
  (e: unknown) => e instanceof ApiError && e.code === 'INVALID_STAKE',
);
if (closed) {
  await assert.rejects(
    api.pick(init.round.id, closed.id, 1),
    (e: unknown) => e instanceof ApiError && e.code === 'MARKET_UNAVAILABLE',
  );
}
await assert.rejects(api.cashOut(), (e: unknown) => e instanceof ApiError && e.code === 'NO_RUN');

// simulated return over many single picks (lowest-priced open market, cash out after one win: no streak bonus)
const sim = createMockServer({ latencyMs: 0, random });
let { round, balance } = await sim.init();
const start = balance;
const ROUNDS = 20000;
let staked = 0;
for (let i = 0; i < ROUNDS; i++) {
  const choice = round.markets.filter((m) => m.available).sort((a, b) => a.price - b.price)[0].id;
  await sim.pick(round.id, choice, 1);
  staked += 1;
  const s = await sim.settle(round.id);
  round = s.round;
  balance = s.outcome === 'won' ? (await sim.cashOut()).balance : s.balance;
}
const returned = balance - start + staked;
const rtp = returned / staked;
assert.ok(Math.abs(rtp - RTP) < 0.02, `simulated RTP ${rtp.toFixed(4)} far from ${RTP}`);

console.log(`mockServer.check: ok (simulated single-pick RTP ${rtp.toFixed(4)} over ${ROUNDS} rounds)`);
