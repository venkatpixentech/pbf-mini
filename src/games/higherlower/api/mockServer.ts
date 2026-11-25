// MOCK BACKEND for Higher or Lower. Stands in for the real server until its contract exists (Q1).
// It owns every outcome, price and balance, exactly as the real server must; the UI only renders responses.
// Maths are a simplified version of the prototype (RTP 0.96, streak cash-out bonus 5/10/15%).
import type { SessionErrorCode } from '../../../core/services/apiError.ts';
import { createMockServerClock, type MockServerClock } from '../../../core/round/mockClock.ts';
import { mockTransport } from '../../../core/services/mockTransport.ts';
import { roundMoney } from '../../../core/services/money.ts';
import { MOCK_PLAYERS } from './mockData.ts';
import {
  type Card,
  type HigherLowerApi,
  type Market,
  type MarketId,
  type Outcome,
  type ResultResponse,
  type RoundInfo,
  type Run,
} from './types.ts';

export const RTP = 0.96;
export const STAKES = [1, 2, 5, 10, 20];
const START_BALANCE = 1000;
// round timeline (server time): betting is open for BETTING_MS; the next round opens NEXT_ROUND_DELAY_MS after betting
// closed, which leaves room for the reveal and result on screen. Mock choices: the real server owns its cadence.
export const BETTING_MS = 8000;
export const NEXT_ROUND_DELAY_MS = 5000;
// shortcut: market availability bounds are a mock choice; the real maths owner sets them.
const MIN_P = 0.08;
const MAX_P = 0.92;
const MARKETS: Array<{ id: MarketId; label: string }> = [
  { id: 'H1', label: 'Higher' },
  { id: 'H2', label: 'Higher 2+' },
  { id: 'H3', label: 'Higher 3+' },
  { id: 'L1', label: 'Lower' },
  { id: 'L2', label: 'Lower 2+' },
  { id: 'L3', label: 'Lower 3+' },
];

/** The one settlement rule: Hn wins if next >= cur + n, Ln wins if next <= cur - n. */
export const wins = (market: MarketId, cur: number, next: number): boolean =>
  market[0] === 'H' ? next - cur >= Number(market[1]) : cur - next >= Number(market[1]);

export const bonusPct = (streak: number): number => (streak >= 5 ? 15 : streak === 4 ? 10 : streak === 3 ? 5 : 0);

/** Probability that `market` wins, drawing the next card uniformly from the pool minus the current card. */
export function winProbability(market: MarketId, current: Card, pool: Card[] = MOCK_PLAYERS): number {
  const others = pool.filter((c) => c !== current);
  return others.filter((c) => wins(market, current.ovr, c.ovr)).length / others.length;
}

export function marketsFor(current: Card, pool: Card[] = MOCK_PLAYERS): Market[] {
  return MARKETS.map(({ id, label }) => {
    const p = winProbability(id, current, pool);
    const available = p >= MIN_P && p <= MAX_P;
    return { id, label, available, price: available ? Math.floor((RTP / p) * 100) / 100 : 0 };
  });
}

type Options = {
  latencyMs?: number;
  random?: () => number;
  pool?: Card[];
  currency?: string;
  /** Simulate a session failure at init (tests the boot error screen). */
  initError?: SessionErrorCode | null;
  /** The mock server's clock. It is offset from the client's on purpose (core/round/mockClock). */
  clock?: MockServerClock;
  bettingMs?: number;
  nextRoundDelayMs?: number;
};

export function createMockServer({
  latencyMs = 150,
  random = Math.random,
  pool = MOCK_PLAYERS,
  currency = 'GBP',
  initError = null,
  clock = createMockServerClock(),
  bettingMs = BETTING_MS,
  nextRoundDelayMs = NEXT_ROUND_DELAY_MS,
}: Options = {}): HigherLowerApi {
  let balance = START_BALANCE;
  let roundNo = 0;
  let round: RoundInfo;
  let pick: MarketId | null = null;
  let run: Run | null = null;
  // the settled result of the round that just closed, and the answers to request ids already applied
  let lastResult: { roundId: string; response: ResultResponse } | null = null;
  const applied = new Map<string, unknown>();

  const { reply, fail } = mockTransport(latencyMs);
  const draw = (exclude?: Card): Card => {
    const others = exclude ? pool.filter((c) => c !== exclude) : pool;
    return others[Math.floor(random() * others.length)];
  };
  const withCash = (r: Run): Run => {
    const pct = bonusPct(r.streak);
    return { ...r, bonusPct: pct, cashValue: r.streak >= 1 ? roundMoney(r.value * (1 + pct / 100)) : 0 };
  };
  const timing = (opensAt: number, closesAt: number) => ({ serverTime: clock.now(), opensAt, closesAt });
  const openRound = (current: Card, opensAt: number) => {
    roundNo += 1;
    round = {
      id: `r${roundNo}`,
      current,
      markets: marketsFor(current, pool),
      timing: timing(opensAt, opensAt + bettingMs),
    };
    pick = null;
  };
  /** The round as it is now: a fresh server time on its timing. */
  const snapshot = (): RoundInfo => ({ ...round, timing: timing(round.timing.opensAt, round.timing.closesAt) });
  const isOpen = () => clock.now() >= round.timing.opensAt && clock.now() < round.timing.closesAt;
  /** A request id is applied once; a repeat gets the original response. */
  const once = <T>(requestId: string, make: () => Promise<T>): Promise<T> =>
    applied.has(requestId) ? Promise.resolve(applied.get(requestId) as T) : make();
  const remember = <T>(requestId: string, value: T): T => {
    applied.set(requestId, value);
    return value;
  };

  return {
    init() {
      if (initError) return fail(initError);
      openRound(draw(), clock.now());
      return reply({ balance, currency, stakes: STAKES, round: snapshot() });
    },

    pick(roundId, market, stake, requestId) {
      return once(requestId, () => {
        if (roundId !== round.id) return fail('ROUND_CLOSED');
        if (clock.now() < round.timing.opensAt) return fail('ROUND_NOT_OPEN');
        if (!isOpen()) return fail('ROUND_CLOSED');
        if (!round.markets.find((m) => m.id === market)?.available) return fail('MARKET_UNAVAILABLE');
        if (!run) {
          if (!STAKES.includes(stake)) return fail('INVALID_STAKE');
          if (roundMoney(stake) > roundMoney(balance)) return fail('INSUFFICIENT_BALANCE');
          balance = roundMoney(balance - stake);
          run = withCash({ stake, value: stake, streak: 0, bonusPct: 0, cashValue: 0 });
        }
        pick = market;
        return reply(remember(requestId, { serverTime: clock.now(), balance, run, pick: market }));
      });
    },

    result(roundId) {
      // settled once; asking again (a retry, a reconnect, a second tab) returns the same answer
      if (lastResult?.roundId === roundId) return reply({ ...lastResult.response, serverTime: clock.now() });
      if (roundId !== round.id) return fail('ROUND_CLOSED');
      if (clock.now() < round.timing.closesAt) return fail('ROUND_NOT_CLOSED');
      const closedRound = round;
      const current = round.current;
      const next = draw(current);
      let outcome: Outcome = 'no-pick';
      if (pick && run) {
        const price = round.markets.find((m) => m.id === pick)!.price;
        if (wins(pick, current.ovr, next.ovr)) {
          outcome = 'won';
          run = withCash({ ...run, value: roundMoney(run.value * price), streak: run.streak + 1 });
        } else {
          outcome = 'lost';
          run = null;
        }
      }
      openRound(next, closedRound.timing.closesAt + nextRoundDelayMs);
      const response: ResultResponse = { serverTime: clock.now(), next, outcome, run, balance, round: snapshot() };
      lastResult = { roundId, response };
      return reply(response);
    },

    cashOut(requestId) {
      return once(requestId, () => {
        if (!isOpen()) return fail('ROUND_CLOSED');
        if (!run || run.streak < 1) return fail('NO_RUN');
        const amount = run.cashValue;
        balance = roundMoney(balance + amount);
        run = null;
        pick = null;
        return reply(remember(requestId, { serverTime: clock.now(), amount, balance }));
      });
    },
  };
}
