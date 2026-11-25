// Self-check for the Last Man Standing mock backend: wallet, fixtures, picks, prizes and return.
// Run with `npm run check` (Node strips the types; no test framework needed).
import assert from 'node:assert/strict';

import { LMS_DATA } from './mockData.ts';
import { createMockServer, matchProbs, ROUNDS } from './mockServer.ts';
import type { Fixture, Game } from './types.ts';

// seeded random so the check is repeatable
const seeded = (seed: number) => () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
};
const fresh = (seed = 1) => createMockServer({ latencyMs: 0, random: seeded(seed) });
const available = (g: Game) => g.teams.filter((t) => !g.used.includes(t.code));
const fixtureOf = (g: Game, code: string): Fixture => g.schedule[g.gw].find((f) => f.home === code || f.away === code)!;
const winP = (g: Game, code: string) => {
  const f = fixtureOf(g, code);
  return f.home === code ? f.probs[0] : f.probs[2];
};
const bestPick = (g: Game) => available(g).sort((a, b) => winP(g, b.code) - winP(g, a.code))[0].code;

// init
const api = fresh();
const init = await api.init();
assert.deepEqual(init.stakes, [1, 2, 5, 10]);
assert.equal(init.leagues.length, 3);
assert.equal(init.modes.length, 3);
await assert.rejects(createMockServer({ latencyMs: 0, initError: 'MAINTENANCE' }).init(), { code: 'MAINTENANCE' });

// start: validation and stake
await assert.rejects(api.start('nope', 'easy', 5), { code: 'INVALID_LEAGUE' });
await assert.rejects(api.start('epl', 'nope', 5), { code: 'INVALID_MODE' });
await assert.rejects(api.start('epl', 'easy', 7), { code: 'INVALID_STAKE' });
const started = await api.start('epl', 'medium', 5);
assert.equal(started.balance, init.balance - 5, 'stake is taken');
const g0 = started.game;
await assert.rejects(api.start('epl', 'medium', 5), { code: 'GAME_ACTIVE' });

// fixtures: 20 clubs, 38 weeks, every pair meets home and away, probabilities sum to 1
assert.equal(g0.teams.length, 20);
assert.equal(g0.schedule.length, 38);
assert.equal(g0.ladder.length, ROUNDS);
const pairs = new Set<string>();
g0.schedule.forEach((week) => {
  assert.equal(week.length, 10);
  assert.equal(new Set(week.flatMap((f) => [f.home, f.away])).size, 20, 'each club plays once per week');
  week.forEach((f) => {
    pairs.add(`${f.home}-${f.away}`);
    assert.ok(Math.abs(f.probs[0] + f.probs[1] + f.probs[2] - 1) < 1e-9);
  });
});
assert.equal(pairs.size, 380, 'every ordered pair appears once');
assert.ok(
  g0.ladder.every((m, i) => i === 0 || m > g0.ladder[i - 1]),
  'ladder rises every round',
);

// match model: a stronger side is favoured, home advantage exists
const t = Object.fromEntries(g0.teams.map((x) => [x.code, x]));
const strong = [...g0.teams].sort((a, b) => b.ovr - a.ovr)[0];
const weak = [...g0.teams].sort((a, b) => a.ovr - b.ovr)[0];
assert.ok(matchProbs(strong, weak)[0] > matchProbs(weak, strong)[0]);
assert.ok(matchProbs(t[strong.code], t[strong.code])[0] > matchProbs(t[strong.code], t[strong.code])[2], 'home edge');

// pick: unknown team, then play until the first result
await assert.rejects(api.pick(g0.id, 'ZZZ'), { code: 'UNKNOWN_TEAM' });
await assert.rejects(api.pick('other', g0.teams[0].code), { code: 'NO_GAME' });
await assert.rejects(api.cashOut(g0.id), { code: 'CANNOT_CASH_OUT' });
const game = g0;
const balance = started.balance;
const result = await api.pick(game.id, bestPick(game));
assert.equal(result.results.length, 10, 'whole week is played');
if (result.won) {
  assert.equal(result.game.wins, 1);
  assert.equal(result.game.gw, 1);
  assert.equal(result.game.used.length, 1);
  await assert.rejects(api.pick(game.id, result.game.used[0]), { code: 'TEAM_USED' });
  const cash = await api.cashOut(game.id);
  assert.equal(cash.amount, Math.round(5 * g0.ladder[0] * 100) / 100, 'cash out pays the ladder rung');
  assert.equal(cash.balance, Math.round((result.balance + cash.amount) * 100) / 100);
  await assert.rejects(api.pick(game.id, bestPick(result.game)), { code: 'GAME_OVER' });
} else {
  assert.equal(result.game.over, true, 'a draw or defeat ends the game');
  assert.equal(result.balance, balance, 'a lost game pays nothing');
  await assert.rejects(api.cashOut(game.id), { code: 'GAME_OVER' });
}

// a played game can start again; a loss never pays
for (let seed = 1; seed < 60; seed++) {
  const s = fresh(seed);
  const before = (await s.init()).balance;
  const { game: gm } = await s.start('laliga', 'hard', 2);
  const r = await s.pick(gm.id, bestPick(gm));
  if (!r.won) {
    assert.equal(r.balance, before - 2);
    break;
  }
}

// return: always back the likeliest winner and cash out after round 1 (ladder priced at ~95% of best play)
let staked = 0;
let returned = 0;
const GAMES = 6000;
const rnd = seeded(99);
const sim = createMockServer({ latencyMs: 0, random: rnd, startBalance: 1e6 });
for (let i = 0; i < GAMES; i++) {
  const league = ['epl', 'laliga', 'bra'][i % 3];
  const mode = ['easy', 'medium', 'hard'][Math.floor(i / 3) % 3];
  const { game: gm } = await sim.start(league, mode, 1);
  staked += 1;
  const r = await sim.pick(gm.id, bestPick(gm));
  if (r.won) returned += (await sim.cashOut(gm.id)).amount;
}
const rtp = returned / staked;
assert.ok(rtp > 0.8 && rtp < 1.0, `round-1 return ${rtp.toFixed(4)} should be just under 1`);

// mock wallet reset: refused mid-game, restores the starting balance once the game is over
{
  const s = createMockServer({ latencyMs: 0, random: seeded(5) });
  let cur = (await s.start('epl', 'easy', 10)).game;
  await assert.rejects(s.resetDemoBalance(), { code: 'GAME_ACTIVE' });
  while (!cur.over) cur = (await s.pick(cur.id, bestPick(cur))).game;
  const reset = await s.resetDemoBalance();
  assert.equal(reset.balance, 100);
}

// data sanity
for (const m of Object.values(LMS_DATA.modes)) {
  assert.equal(m.pool.length, m.ladders.length);
  assert.ok(m.pool.every((p) => new Set(p).size === 20));
}
console.log(`lastmanstanding mockServer.check: ok (round-1 return ${rtp.toFixed(4)} over ${GAMES} games)`);
