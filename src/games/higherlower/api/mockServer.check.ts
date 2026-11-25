// Self-check: node --experimental-strip-types --no-warnings src/games/higherlower/api/mockServer.check.ts
import assert from 'node:assert/strict';

import { createMockServerClock } from '../../../core/round/mockClock.ts';
import { MOCK_PLAYERS } from './mockData.ts';
import {
  BETTING_MS,
  createMockServer,
  marketsFor,
  NEXT_ROUND_DELAY_MS,
  RTP,
  winProbability,
  wins,
} from './mockServer.ts';
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

// a controllable server clock: the test moves time, nothing waits
let now = 1_000_000;
const clockFor = () => createMockServerClock({ skewMs: 0, base: () => now });

// errors at the trust boundary
const api = createMockServer({ latencyMs: 0, random, clock: clockFor() });
const init = await api.init();
const open = init.round.markets.find((m) => m.available)!.id;
const closed = init.round.markets.find((m) => !m.available);
await assert.rejects(
  api.pick('stale', open, 1, 'e1'),
  (e: unknown) => e instanceof ApiError && e.code === 'ROUND_CLOSED',
);
await assert.rejects(
  api.pick(init.round.id, open, 3, 'e2'),
  (e: unknown) => e instanceof ApiError && e.code === 'INVALID_STAKE',
);
if (closed) {
  await assert.rejects(
    api.pick(init.round.id, closed.id, 1, 'e3'),
    (e: unknown) => e instanceof ApiError && e.code === 'MARKET_UNAVAILABLE',
  );
}
await assert.rejects(api.cashOut('e4'), (e: unknown) => e instanceof ApiError && e.code === 'NO_RUN');

// the round timeline belongs to the server
{
  const clock = clockFor();
  const server = createMockServer({ latencyMs: 0, random, clock });
  const first = await server.init();
  assert.equal(first.round.timing.closesAt - first.round.timing.opensAt, BETTING_MS, 'betting window');
  assert.equal(first.round.timing.serverTime, now, 'timing carries the server time');
  const market = first.round.markets.find((m) => m.available)!.id;
  // result before the server closed the round
  await assert.rejects(
    server.result(first.round.id),
    (e: unknown) => e instanceof ApiError && e.code === 'ROUND_NOT_CLOSED',
    'result before close',
  );
  // an idempotent pick: the same request id takes the stake once
  const before = (await server.pick(first.round.id, market, 5, 'same')).balance;
  const again = await server.pick(first.round.id, market, 5, 'same');
  assert.equal(again.balance, before, 'a repeated request id is not applied twice');
  assert.equal(before, first.balance - 5, 'the stake was taken once');
  // after the server closes betting: picks are refused whatever the client clock says
  now = first.round.timing.closesAt;
  await assert.rejects(
    server.pick(first.round.id, market, 5, 'late'),
    (e: unknown) => e instanceof ApiError && e.code === 'ROUND_CLOSED',
    'a late pick',
  );
  // settlement happens once
  const settled = await server.result(first.round.id);
  const replay = await server.result(first.round.id);
  assert.equal(replay.balance, settled.balance, 'asking again does not settle again');
  assert.deepEqual({ ...replay, serverTime: 0 }, { ...settled, serverTime: 0 }, 'the same result again');
  // the next round opens later, on the server's schedule
  assert.equal(
    settled.round.timing.opensAt,
    first.round.timing.closesAt + NEXT_ROUND_DELAY_MS,
    'next round opens later',
  );
  await assert.rejects(
    server.pick(settled.round.id, market, 5, 'early'),
    (e: unknown) => e instanceof ApiError && e.code === 'ROUND_NOT_OPEN',
    'a pick before the round opens',
  );
  now = settled.round.timing.opensAt;
  // an idempotent cash out
  const open2 = settled.round.markets.filter((m) => m.available).sort((a, b) => a.price - b.price)[0].id;
  if (settled.outcome === 'won') {
    const c1 = await server.cashOut('cash-1');
    const c2 = await server.cashOut('cash-1');
    assert.equal(c2.balance, c1.balance, 'a repeated cash out is not paid twice');
  } else {
    await server.pick(settled.round.id, open2, 1, 'next');
  }
}

// simulated return over many single picks (lowest-priced open market, cash out after one win: no streak bonus)
now = 1_000_000;
const sim = createMockServer({ latencyMs: 0, random, clock: clockFor() });
let { round, balance } = await sim.init();
const start = balance;
const ROUNDS = 20000;
let staked = 0;
for (let i = 0; i < ROUNDS; i++) {
  const choice = round.markets.filter((m) => m.available).sort((a, b) => a.price - b.price)[0].id;
  await sim.pick(round.id, choice, 1, `pick${i}`);
  staked += 1;
  now = round.timing.closesAt; // the server closes betting
  const s = await sim.result(round.id);
  round = s.round;
  now = round.timing.opensAt; // the next round opens
  balance = s.outcome === 'won' ? (await sim.cashOut(`cash${i}`)).balance : s.balance;
}
const returned = balance - start + staked;
const rtp = returned / staked;
assert.ok(Math.abs(rtp - RTP) < 0.02, `simulated RTP ${rtp.toFixed(4)} far from ${RTP}`);

console.log(`mockServer.check: ok (simulated single-pick RTP ${rtp.toFixed(4)} over ${ROUNDS} rounds)`);
