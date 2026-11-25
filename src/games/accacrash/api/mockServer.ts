// MOCK BACKEND for Acca Crash. Stands in for the real server until its contract exists (Q1).
// It owns the crash point, goal boosts, auto and manual cash-outs and the balance; the UI only renders replies.
// Multiplier: m(t) = e^(GROWTH * t) + boosts so far. Crash point M: P(M >= x) = RTP / x (standard crash curve).
// Boosts only change WHEN the run reaches M, never M itself, so they do not change the return.
import type { SessionErrorCode } from '../../../core/services/apiError.ts';
import { mockTransport } from '../../../core/services/mockTransport.ts';
import { roundMoney } from '../../../core/services/money.ts';
import { MOCK_SCORERS, TIER_BOOST } from './mockData.ts';
import {
  type AccaCrashApi,
  type Bet,
  type GoalEvent,
  type Panel,
  type RoundInfo,
  type ScorerCard,
  type StatusResponse,
} from './types.ts';

export const RTP = 0.96;
export const GROWTH = 0.06; // per second, as in the prototype
export const STAKES = [1, 2, 5, 10, 20, 50, 100];
export const AUTO_OPTIONS = [1.5, 2, 3, 5, 10];
const MAX_CRASH = 1000;
const START_BALANCE = 1000;

export const base = (ms: number) => Math.exp((GROWTH * ms) / 1000);

/** Draw the crash point from a uniform U in [0, 1). Floored to 2 decimals, at least 1.00. */
export const crashPointFrom = (u: number) => Math.min(MAX_CRASH, Math.max(1, Math.floor((RTP / (1 - u)) * 100) / 100));

type Step = { atMs: number; boostTotal: number }; // boost total from atMs onwards

/** First time the multiplier reaches `x`, given boost steps (sorted, first at 0). Infinity if never. */
export function timeToReach(x: number, steps: Step[]): number {
  for (let i = 0; i < steps.length; i++) {
    const { atMs, boostTotal } = steps[i];
    const end = i + 1 < steps.length ? steps[i + 1].atMs : Infinity;
    if (base(atMs) + boostTotal >= x) return atMs; // a boost jumped over x at this instant
    const t = x - boostTotal <= 1 ? 0 : (Math.log(x - boostTotal) / GROWTH) * 1000;
    if (t < end) return Math.max(t, atMs);
  }
  return Infinity;
}

type Run = { crashPoint: number; crashAtMs: number; steps: Step[]; goals: GoalEvent[] };

/** Pre-plan a run on the server: crash point, goal events and capped boosts. Never sent to the client. */
export function planRun(cards: ScorerCard[], random: () => number): Run {
  const crashPoint = crashPointFrom(random());
  const steps: Step[] = [{ atMs: 0, boostTotal: 0 }];
  const goals: GoalEvent[] = [];
  let boostTotal = 0;
  const horizon = (Math.log(crashPoint) / GROWTH) * 1000; // no goals after the run would crash unboosted
  for (let at = 3000 + random() * 3000, minute = 5; at < horizon; at += 3000 + random() * 3000) {
    minute = Math.min(90, minute + 5 + Math.floor(random() * 10));
    const mine = random() < 0.35;
    const card = mine ? cards[Math.floor(random() * cards.length)] : null;
    const other = MOCK_SCORERS[Math.floor(random() * MOCK_SCORERS.length)];
    const room = crashPoint - 0.02 - (base(at) + boostTotal);
    const boost = card ? roundMoney(Math.max(0, Math.min(card.boost, room))) : 0;
    if (base(at) + boostTotal >= crashPoint) break;
    goals.push({ atMs: Math.round(at), minute, scorer: (card ?? other).name, club: (card ?? other).club, mine, boost });
    if (boost > 0) {
      boostTotal = roundMoney(boostTotal + boost);
      steps.push({ atMs: Math.round(at), boostTotal });
    }
  }
  return { crashPoint, crashAtMs: timeToReach(crashPoint, steps), steps, goals };
}

type Options = {
  latencyMs?: number;
  random?: () => number;
  now?: () => number;
  startBalance?: number;
  currency?: string;
  /** Simulate a session failure at init (tests the boot error screen). */
  initError?: SessionErrorCode | null;
};

export function createMockServer({
  latencyMs = 80,
  random = Math.random,
  now = Date.now,
  startBalance = START_BALANCE,
  currency = 'GBP',
  initError = null,
}: Options = {}): AccaCrashApi {
  let balance = startBalance;
  let roundNo = 0;
  let round: RoundInfo;
  let phase: 'betting' | 'running' | 'ended' = 'betting';
  let run: Run | null = null;
  let startedAt = 0;
  const history: number[] = [];
  const bets = new Map<Panel, Bet>();

  const { reply, fail } = mockTransport(latencyMs);
  const betList = () => [...bets.values()].map((b) => ({ ...b }));

  const deal = (): ScorerCard[] => {
    const pool = [...MOCK_SCORERS];
    return Array.from({ length: 3 }, (_, i) => {
      const s = pool.splice(Math.floor(random() * pool.length), 1)[0];
      return { id: `c${roundNo}-${i}`, ...s, boost: TIER_BOOST[s.tier] };
    });
  };
  const openRound = () => {
    roundNo += 1;
    round = { id: `r${roundNo}`, cards: deal() };
    phase = 'betting';
    run = null;
    bets.clear();
  };

  const multiplierAt = (ms: number) => {
    let boost = 0;
    for (const s of run!.steps) if (s.atMs <= ms) boost = s.boostTotal;
    return Math.floor((base(ms) + boost) * 100) / 100;
  };

  /** Settle auto cash-outs and losses up to elapsed time `ms`. Credits each bet exactly once. */
  const resolve = (ms: number) => {
    for (const bet of bets.values()) {
      if (bet.status !== 'placed') continue;
      if (
        bet.autoCashOut !== null &&
        bet.autoCashOut < run!.crashPoint &&
        ms >= timeToReach(bet.autoCashOut, run!.steps)
      ) {
        bet.status = 'cashed';
        bet.cashedAt = bet.autoCashOut;
        bet.payout = roundMoney(bet.stake * bet.autoCashOut);
        balance = roundMoney(balance + bet.payout);
      } else if (ms >= run!.crashAtMs) {
        bet.status = 'lost';
      }
    }
    if (ms >= run!.crashAtMs && phase === 'running') {
      phase = 'ended';
      history.unshift(run!.crashPoint);
      history.splice(10);
    }
  };

  const status = (): StatusResponse => {
    const ms = Math.max(0, now() - startedAt);
    resolve(ms);
    const crashed = phase === 'ended';
    const shownMs = Math.min(ms, run!.crashAtMs);
    return {
      elapsedMs: Math.round(shownMs),
      multiplier: crashed ? run!.crashPoint : multiplierAt(ms),
      crashed,
      crashPoint: crashed ? run!.crashPoint : null,
      goals: run!.goals.filter((g) => g.atMs <= shownMs),
      bets: betList(),
      balance,
    };
  };

  openRound();

  return {
    init: () =>
      initError
        ? fail(initError)
        : reply({ balance, currency, stakes: STAKES, autoOptions: AUTO_OPTIONS, round, history: [...history] }),

    placeBet(roundId, panel, stake, autoCashOut) {
      if (phase !== 'betting' || roundId !== round.id) return fail('ROUND_CLOSED');
      if (bets.has(panel)) return fail('BET_EXISTS');
      if (!STAKES.includes(stake)) return fail('INVALID_STAKE');
      if (autoCashOut !== null && !AUTO_OPTIONS.includes(autoCashOut)) return fail('INVALID_AUTO');
      if (roundMoney(stake) > roundMoney(balance)) return fail('INSUFFICIENT_BALANCE');
      balance = roundMoney(balance - stake);
      bets.set(panel, { panel, stake, autoCashOut, status: 'placed', cashedAt: null, payout: 0 });
      return reply({ balance, bets: betList() });
    },

    cancelBet(roundId, panel) {
      if (phase !== 'betting' || roundId !== round.id) return fail('ROUND_CLOSED');
      const bet = bets.get(panel);
      if (!bet) return fail('NO_BET');
      balance = roundMoney(balance + bet.stake);
      bets.delete(panel);
      return reply({ balance, bets: betList() });
    },

    start(roundId) {
      if (phase !== 'betting' || roundId !== round.id) return fail('ROUND_CLOSED');
      run = planRun(round.cards, random);
      startedAt = now();
      phase = 'running';
      return reply(status());
    },

    status(roundId) {
      if (!run || roundId !== round.id) return fail('ROUND_CLOSED');
      return reply(status());
    },

    cashOut(roundId, panel) {
      if (!run || roundId !== round.id) return fail('ROUND_CLOSED');
      const ms = Math.max(0, now() - startedAt);
      resolve(ms); // an auto cash-out or the crash may already have happened
      const bet = bets.get(panel);
      if (!bet || bet.status !== 'placed') return phase === 'ended' ? fail('ROUND_CLOSED') : fail('NO_BET');
      const m = multiplierAt(ms);
      bet.status = 'cashed';
      bet.cashedAt = m;
      bet.payout = roundMoney(bet.stake * m);
      balance = roundMoney(balance + bet.payout);
      return reply(status());
    },

    next() {
      if (phase !== 'ended') return fail('ROUND_CLOSED');
      openRound();
      return reply({ round, history: [...history] });
    },
  };
}
