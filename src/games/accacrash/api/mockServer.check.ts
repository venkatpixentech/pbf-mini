// Self-check: node --experimental-strip-types --no-warnings src/games/accacrash/api/mockServer.check.ts
import assert from 'node:assert/strict';

import { createMockServerClock } from '../../../core/round/mockClock.ts';
import {
  base,
  BETTING_MS,
  crashPointFrom,
  createMockServer,
  ENDED_HOLD_MS,
  planRun,
  RTP,
  timeToReach,
} from './mockServer.ts';
import { ApiError, type ScorerCard } from './types.ts';

let seed = 7;
const random = () => (seed = (seed * 1664525 + 1013904223) % 2 ** 32) / 2 ** 32;
let now = 1_000_000;
const clockFor = () => createMockServerClock({ skewMs: 0, base: () => now });

// crash point distribution: P(M >= x) close to RTP / x
assert.equal(crashPointFrom(0), 1, 'low draws crash instantly');
let atLeast2 = 0;
const N = 50000;
for (let i = 0; i < N; i++) if (crashPointFrom(random()) >= 2) atLeast2++;
assert.ok(Math.abs(atLeast2 / N - RTP / 2) < 0.01, `P(M>=2) = ${atLeast2 / N}`);

// timeToReach without boosts inverts the growth curve
assert.ok(Math.abs(base(timeToReach(2, [{ atMs: 0, boostTotal: 0 }])) - 2) < 1e-9);

// boosts never reach the crash point early, and the run crashes exactly at M
const cards: ScorerCard[] = [
  { id: 'a', name: 'A', club: 'X', tier: 'gold', boost: 0.5 },
  { id: 'b', name: 'B', club: 'Y', tier: 'silver', boost: 0.25 },
  { id: 'c', name: 'C', club: 'Z', tier: 'bronze', boost: 0.1 },
];
let boosted = 0;
for (let i = 0; i < 2000; i++) {
  const run = planRun(cards, random);
  if (run.steps.length > 1) boosted++;
  for (const step of run.steps)
    assert.ok(base(step.atMs) + step.boostTotal < run.crashPoint || run.crashPoint === 1, 'boost jumps past M');
  assert.ok(Math.abs(timeToReach(run.crashPoint, run.steps) - run.crashAtMs) < 1e-6);
}
assert.ok(boosted > 100, `boosts happen (${boosted} of 2000 runs)`);

// server-timed round: validation, idempotency, timeline
{
  const clock = clockFor();
  const api = createMockServer({ latencyMs: 0, random, clock, startBalance: 1_000_000 });
  const init = await api.init();
  const id = init.round.id;
  assert.equal(init.round.timing.closesAt - init.round.timing.opensAt, BETTING_MS, 'betting window');
  assert.equal(init.round.timing.serverTime, now, 'timing carries the server time');
  await assert.rejects(
    api.placeBet(id, 0, 3, null, 'e1'),
    (e: unknown) => e instanceof ApiError && e.code === 'INVALID_STAKE',
  );
  await assert.rejects(
    api.placeBet(id, 0, 1, 7, 'e2'),
    (e: unknown) => e instanceof ApiError && e.code === 'INVALID_AUTO',
  );
  let r = await api.placeBet(id, 0, 10, null, 'e3');
  assert.equal(r.balance, init.balance - 10);
  await assert.rejects(
    api.placeBet(id, 0, 1, null, 'e4'),
    (e: unknown) => e instanceof ApiError && e.code === 'BET_EXISTS',
  );
  r = await api.cancelBet(id, 0, 'c1');
  assert.equal(r.balance, init.balance, 'cancel refunds the stake');
  // idempotent bet: the same request id takes the stake once
  const before = (await api.placeBet(id, 0, 5, null, 'same')).balance;
  const again = await api.placeBet(id, 0, 5, null, 'same');
  assert.equal(again.balance, before, 'a repeated request id is not applied twice');
  assert.equal(before, init.balance - 5, 'the stake was taken once');
  // after the server closes betting, bets are refused
  now = init.round.timing.closesAt;
  await assert.rejects(
    api.placeBet(id, 0, 10, null, 'late'),
    (e: unknown) => e instanceof ApiError && e.code === 'ROUND_CLOSED',
    'a late bet',
  );
  // status after crash
  now = init.round.timing.closesAt + 10 ** 9;
  const ended = await api.status(id);
  assert.equal(ended.phase, 'completed');
  assert.ok(ended.crashed);
  assert.ok(ended.nextOpensAt !== null, 'nextOpensAt set after crash');
  // next round not ready until nextOpensAt
  now = ended.nextOpensAt! - 1;
  await assert.rejects(
    api.next(),
    (e: unknown) => e instanceof ApiError && e.code === 'ROUND_NOT_READY',
    'next before nextOpensAt',
  );
  now = ended.nextOpensAt!;
  const nr = await api.next();
  assert.ok(nr.round.id !== id, 'new round id');
  assert.equal(nr.round.timing.serverTime, now);
  // idempotent next returns the same round
  const nr2 = await api.next();
  assert.equal(nr2.round.id, nr.round.id, 'repeated next returns same round');
}

// simulated return: bet 1 on both panels, panel 0 auto at 2x, panel 1 auto at 5x
now = 1_000_000;
const sim = createMockServer({ latencyMs: 0, random, clock: clockFor(), startBalance: 1_000_000 });
const simInit = await sim.init();
let round = simInit.round;
let balance = simInit.balance;
const startBalance = balance;
let staked = 0;
const ROUNDS = 20000;
for (let i = 0; i < ROUNDS; i++) {
  await sim.placeBet(round.id, 0, 1, 2, `b0-${i}`);
  await sim.placeBet(round.id, 1, 1, 5, `b1-${i}`);
  staked += 2;
  now = round.timing.closesAt; // betting closes, run starts on server
  now += 10 ** 9; // far past any crash
  const end = await sim.status(round.id);
  assert.ok(end.crashed);
  for (const bet of end.bets) {
    if (bet.status === 'cashed') assert.equal(bet.payout, bet.stake * bet.autoCashOut!, 'auto pays the target exactly');
  }
  balance = end.balance;
  now = end.nextOpensAt!;
  round = (await sim.next()).round;
}
const rtp = (balance - startBalance + staked) / staked;
assert.ok(Math.abs(rtp - RTP) < 0.03, `simulated RTP ${rtp.toFixed(4)}`);

// manual cash-out mid-run pays the server multiplier, cash-out after crash is rejected
for (let tries = 0; tries < 50; tries++) {
  await sim.placeBet(round.id, 0, 10, null, `mp-${tries}`);
  now = round.timing.closesAt + 100; // 0.1 s into the run
  try {
    const out = await sim.cashOut(round.id, 0, `co-${tries}`);
    const bet = out.bets.find((b) => b.panel === 0)!;
    if (bet.status === 'cashed') {
      assert.ok(bet.cashedAt! >= 1 && bet.cashedAt! < 1.1, `cashed at ${bet.cashedAt}`);
      now += 10 ** 9;
      await assert.rejects(sim.cashOut(round.id, 0, `co-dup-${tries}`));
      break;
    }
  } catch {
    // crashed before 100ms, try next round
  }
  now += 10 ** 9;
  const endStat = await sim.status(round.id);
  now = endStat.nextOpensAt!;
  round = (await sim.next()).round;
}

console.log(
  `acca mockServer.check: ok (P(M>=2) ${(atLeast2 / N).toFixed(3)}, simulated RTP ${rtp.toFixed(4)}, ${boosted}/2000 runs boosted)`,
);
