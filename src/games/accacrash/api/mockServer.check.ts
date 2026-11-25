// Self-check: node --experimental-strip-types --no-warnings src/games/accacrash/api/mockServer.check.ts
import assert from 'node:assert/strict';

import { base, crashPointFrom, createMockServer, planRun, RTP, timeToReach } from './mockServer.ts';
import { ApiError, type ScorerCard } from './types.ts';

let seed = 7;
const random = () => (seed = (seed * 1664525 + 1013904223) % 2 ** 32) / 2 ** 32;
let clock = 0;
const now = () => clock;

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

// API: validation, cancel refund, manual cash-out below the crash, auto cash-out pays exactly the target
const api = createMockServer({ latencyMs: 0, random, now, startBalance: 1_000_000 });
const init = await api.init();
const id = init.round.id;
await assert.rejects(api.placeBet(id, 0, 3, null), (e: unknown) => e instanceof ApiError && e.code === 'INVALID_STAKE');
await assert.rejects(api.placeBet(id, 0, 1, 7), (e: unknown) => e instanceof ApiError && e.code === 'INVALID_AUTO');
let r = await api.placeBet(id, 0, 10, null);
assert.equal(r.balance, init.balance - 10);
await assert.rejects(api.placeBet(id, 0, 1, null), (e: unknown) => e instanceof ApiError && e.code === 'BET_EXISTS');
r = await api.cancelBet(id, 0);
assert.equal(r.balance, init.balance, 'cancel refunds the stake');

// simulated return: bet 1 on both panels, panel 0 auto at 2x, panel 1 auto at 5x
let { round } = init;
let balance = init.balance;
let staked = 0;
const ROUNDS = 20000;
for (let i = 0; i < ROUNDS; i++) {
  await api.placeBet(round.id, 0, 1, 2);
  await api.placeBet(round.id, 1, 1, 5);
  staked += 2;
  const s = await api.start(round.id);
  if (!s.crashed) {
    clock += 10 ** 9; // far past any crash: the server settles autos and losses by itself
    const end = await api.status(round.id);
    assert.ok(end.crashed);
    for (const bet of end.bets) {
      if (bet.status === 'cashed')
        assert.equal(bet.payout, bet.stake * bet.autoCashOut!, 'auto pays the target exactly');
    }
    balance = end.balance;
  } else balance = s.balance;
  round = (await api.next()).round;
}
const rtp = (balance - init.balance + staked) / staked;
assert.ok(Math.abs(rtp - RTP) < 0.03, `simulated RTP ${rtp.toFixed(4)}`);

// manual cash-out mid-run pays the server multiplier, and a cash-out after the crash is rejected
for (let tries = 0; tries < 50; tries++) {
  await api.placeBet(round.id, 0, 10, null);
  const s = await api.start(round.id);
  if (s.crashed) {
    round = (await api.next()).round;
    continue;
  }
  clock += 100; // 0.1 s into the run
  const out = await api.cashOut(round.id, 0);
  const bet = out.bets.find((b) => b.panel === 0)!;
  if (bet.status === 'cashed') {
    assert.ok(bet.cashedAt! >= 1 && bet.cashedAt! < 1.1, `cashed at ${bet.cashedAt}`);
    clock += 10 ** 9;
    await assert.rejects(api.cashOut(round.id, 0));
    break;
  }
}

console.log(
  `acca mockServer.check: ok (P(M>=2) ${(atLeast2 / N).toFixed(3)}, simulated RTP ${rtp.toFixed(4)}, ${boosted}/2000 runs boosted)`,
);
