// Self-check for the round utilities: node --experimental-strip-types src/core/round/round.check.ts
// Server clock (offset, best sample, drift, system clock changes), snapshot tracker (duplicates, stale and delayed
// messages, reconnect jumps, finished rounds) and the duplicate-action guard with same-key retries.
import { createActionGuard, retryWithSameKey } from './actionGuard.ts';
import { createMockServerClock } from './mockClock.ts';
import { createRoundTracker, INSTANT_ROUND_ORDER, LIVE_ROUND_ORDER, type RoundSnapshot } from './roundTracker.ts';
import { createServerClock, timed } from './serverClock.ts';

const assert = (ok: boolean, message: string) => {
  if (!ok) throw new Error(`round.check: ${message}`);
};
const near = (a: number, b: number, tolerance: number) => Math.abs(a - b) <= tolerance;

// ---- server clock -------------------------------------------------------------------------------------------
{
  let client = 1_000;
  const clock = createServerClock({ clientNow: () => client });
  assert(
    clock.now() === 1_000 && clock.samples === 0 && clock.rttMs === null,
    'before any sample the client clock is used',
  );

  // server is 5000 ms ahead; a request takes 200 ms (100 each way): the server stamped 5100 at client time 1100
  clock.observe({ serverTime: 6_100, requestedAt: 1_000, receivedAt: 1_200 });
  assert(near(clock.offsetMs, 5_000, 1) && clock.rttMs === 200, 'offset from one sample');
  client = 2_000;
  assert(near(clock.now(), 7_000, 1), 'now() follows the client clock plus the offset');
  assert(near(clock.remainingMs(9_000), 2_000, 1), 'remaining time to a server deadline');
  assert(clock.remainingMs(6_000) < 0, 'a passed deadline is negative');

  // a slower sample with a wrong-looking offset does not replace the best one
  clock.observe({ serverTime: 9_000, requestedAt: 3_000, receivedAt: 4_500 });
  assert(near(clock.offsetMs, 5_000, 1) && clock.rttMs === 200, 'the lowest round trip wins');
  // a faster sample is better
  clock.observe({ serverTime: 5_500 + 5_020, requestedAt: 5_500, receivedAt: 5_540 });
  assert(clock.rttMs === 40 && near(clock.offsetMs, 5_000, 1), 'a faster sample is adopted');

  // drift: the server clock runs faster; old samples roll off and the estimate follows
  const drifting = createServerClock({ clientNow: () => 0, window: 3 });
  for (let i = 0; i < 6; i++)
    drifting.observe({
      serverTime: i * 1_000 + 20 + 1_000 + i * 10,
      requestedAt: i * 1_000,
      receivedAt: i * 1_000 + 40,
    });
  assert(
    near(drifting.offsetMs, 1_050, 1) && drifting.samples === 3,
    'only recent samples are kept, and the newest of equal ones is used',
  );

  // invalid samples are ignored
  const bad = createServerClock({ clientNow: () => 0 });
  bad.observe({ serverTime: NaN, requestedAt: 0, receivedAt: 10 });
  bad.observe({ serverTime: 10, requestedAt: 50, receivedAt: 10 });
  assert(bad.samples === 0, 'invalid samples are ignored');

  // approximate sample (boot's init) is used only until a measured one arrives
  const approx = createServerClock({ clientNow: () => 10_000 });
  approx.observeApprox(15_000);
  assert(near(approx.offsetMs, 5_000, 600), 'approximate sample gives a rough offset');
  approx.observe({ serverTime: 15_050, requestedAt: 10_000, receivedAt: 10_100 });
  assert(approx.rttMs === 100 && near(approx.offsetMs, 5_000, 1), 'a measured sample takes over');
  approx.observeApprox(99_999);
  assert(near(approx.offsetMs, 5_000, 1), 'a later approximate sample is ignored');

  // the mock server clock really is offset, and timed() feeds the clock from a response
  const mock = createMockServerClock({ skewMs: 7_300, base: () => 50_000 });
  const viaTimed = createServerClock({ clientNow: () => 50_000 });
  const response = await timed(
    viaTimed,
    async () => ({ serverTime: mock.now() }),
    (r) => r.serverTime,
    () => 50_000,
  );
  assert(response.serverTime === 57_300 && near(viaTimed.offsetMs, 7_300, 1), 'timed() records the mock server time');
}

// ---- round tracker ------------------------------------------------------------------------------------------
{
  const snap = (roundId: string, phase: RoundSnapshot['phase'], seq: number): RoundSnapshot => ({
    roundId,
    phase,
    seq,
  });
  const tracker = createRoundTracker({ order: LIVE_ROUND_ORDER });

  assert(tracker.apply(snap('r1', 'bettingOpen', 1)).kind === 'newRound', 'first snapshot starts a round');
  assert(tracker.apply(snap('r1', 'bettingOpen', 1)).kind === 'duplicate', 'the same snapshot again is a duplicate');
  assert(tracker.apply(snap('r1', 'running', 3)).kind === 'applied', 'phases may be skipped (missed messages)');
  assert(tracker.apply(snap('r1', 'bettingClosed', 2)).kind === 'stale', 'a delayed older snapshot is stale');
  assert(tracker.apply(snap('r1', 'bettingOpen', 4)).kind === 'invalid', 'a phase going backwards is invalid: resync');
  assert(tracker.current?.phase === 'running', 'an invalid or stale snapshot never replaces the current one');
  assert(
    tracker.apply({ ...snap('r1', 'running', 5), phaseEndsAt: 9_000 }).kind === 'applied',
    'same phase, newer seq updates',
  );
  assert(tracker.apply(snap('r1', 'cancelled', 6)).kind === 'applied', 'cancelled is reachable from anywhere');
  assert(tracker.apply(snap('r1', 'running', 7)).kind === 'stale', 'a finished round never comes back');
  assert(tracker.isFinished('r1'), 'the round is remembered as finished');
  assert(tracker.apply(snap('r2', 'bettingOpen', 1)).kind === 'newRound', 'the next round starts');
  assert(
    tracker.apply(snap('r1', 'settling', 9)).kind === 'stale',
    'a late message of an earlier finished round is ignored',
  );
  assert(tracker.apply(snap('r2', 'unknownPhase' as never, 2)).kind === 'invalid', 'unknown phase');

  // error and recovery
  const t2 = createRoundTracker({ order: LIVE_ROUND_ORDER.concat('error') });
  t2.apply(snap('a', 'running', 1));
  assert(t2.apply(snap('a', 'error', 2)).kind === 'applied', 'error is reachable from anywhere');
  assert(t2.apply(snap('a', 'bettingOpen', 3)).kind === 'applied', 'recovery from error to an earlier phase');

  // instant games use a short order
  const t3 = createRoundTracker({ order: INSTANT_ROUND_ORDER });
  assert(t3.apply(snap('i1', 'bettingOpen', 1)).kind === 'newRound', 'instant round opens');
  assert(t3.apply(snap('i1', 'completed', 2)).kind === 'applied', 'instant round completes without a live phase');
  assert(
    t3.apply(snap('i1', 'running', 3)).kind === 'invalid' || t3.apply(snap('i1', 'running', 3)).kind === 'stale',
    'phases outside its order are refused',
  );
}

// ---- action guard and same-key retries ----------------------------------------------------------------------
{
  let ids = 0;
  const guard = createActionGuard(() => `id${++ids}`);
  let sent = 0;
  const slow = (id: string) =>
    new Promise<string>((resolve) => {
      sent++;
      setTimeout(() => resolve(id), 20);
    });
  const [a, b] = await Promise.all([guard.run('bet:0', slow), guard.run('bet:0', slow)]);
  assert(sent === 1 && a === b && ids === 1, 'a double call sends one request');
  assert(!guard.pending('bet:0'), 'the guard is released afterwards');
  await guard.run('bet:0', slow);
  assert(sent === 2 && ids === 2, 'a later call is a new action with a new id');
  const other = await Promise.all([guard.run('x', slow), guard.run('y', slow)]);
  assert(other.length === 2 && sent === 4, 'different actions are independent');
  let failed: unknown = null;
  await guard.run('boom', () => Promise.reject(new Error('no'))).catch((e) => (failed = e));
  assert(failed !== null && !guard.pending('boom'), 'a failed action releases the guard');

  // retries reuse the request id
  const seen: string[] = [];
  let tries = 0;
  const result = await retryWithSameKey(
    async (id) => {
      seen.push(id);
      if (++tries < 3) throw new Error('network');
      return 'ok';
    },
    { attempts: 3, shouldRetry: () => true, sleep: async () => {} },
  );
  assert(result === 'ok' && seen.length === 3 && new Set(seen).size === 1, 'every retry uses the same request id');
  let calls = 0;
  const refused = await retryWithSameKey(async () => {
    calls++;
    throw new Error('INSUFFICIENT_BALANCE');
  }).catch((e: Error) => e.message);
  assert(refused === 'INSUFFICIENT_BALANCE' && calls === 1, 'errors are not retried unless the policy says so');
  let limited = 0;
  await retryWithSameKey(
    async () => {
      limited++;
      throw new Error('network');
    },
    { attempts: 2, shouldRetry: () => true, sleep: async () => {} },
  ).catch(() => {});
  assert(limited === 2, 'attempts are bounded');
}

console.log('round.check: ok (server clock, snapshot tracker, duplicate-action guard, same-key retries)');
process.exit(0);
