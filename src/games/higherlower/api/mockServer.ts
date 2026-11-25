// MOCK BACKEND for Higher or Lower. Stands in for the real server until its contract exists (Q1).
// It owns every outcome, price and balance, exactly as the real server must; the UI only renders responses.
// Maths are a simplified version of the prototype (RTP 0.96, streak cash-out bonus 5/10/15%).
import type { SessionErrorCode } from '../../../core/services/apiError.ts';
import { mockTransport } from '../../../core/services/mockTransport.ts';
import { roundMoney } from '../../../core/services/money.ts';
import { MOCK_PLAYERS } from './mockData.ts';
import {
  type Card,
  type HigherLowerApi,
  type Market,
  type MarketId,
  type Outcome,
  type RoundInfo,
  type Run,
} from './types.ts';

export const RTP = 0.96;
export const STAKES = [1, 2, 5, 10, 20];
const START_BALANCE = 1000;
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
};

export function createMockServer({
  latencyMs = 150,
  random = Math.random,
  pool = MOCK_PLAYERS,
  currency = 'GBP',
  initError = null,
}: Options = {}): HigherLowerApi {
  let balance = START_BALANCE;
  let roundNo = 0;
  let round: RoundInfo;
  let open = false;
  let pick: MarketId | null = null;
  let run: Run | null = null;

  const { reply, fail } = mockTransport(latencyMs);
  const draw = (exclude?: Card): Card => {
    const others = exclude ? pool.filter((c) => c !== exclude) : pool;
    return others[Math.floor(random() * others.length)];
  };
  const withCash = (r: Run): Run => {
    const pct = bonusPct(r.streak);
    return { ...r, bonusPct: pct, cashValue: r.streak >= 1 ? roundMoney(r.value * (1 + pct / 100)) : 0 };
  };
  const openRound = (current: Card) => {
    roundNo += 1;
    round = { id: `r${roundNo}`, current, markets: marketsFor(current, pool) };
    open = true;
    pick = null;
  };

  return {
    init() {
      if (initError) return fail(initError);
      openRound(draw());
      return reply({ balance, currency, stakes: STAKES, round });
    },

    pick(roundId, market, stake) {
      if (!open || roundId !== round.id) return fail('ROUND_CLOSED');
      if (!round.markets.find((m) => m.id === market)?.available) return fail('MARKET_UNAVAILABLE');
      if (!run) {
        if (!STAKES.includes(stake)) return fail('INVALID_STAKE');
        if (roundMoney(stake) > roundMoney(balance)) return fail('INSUFFICIENT_BALANCE');
        balance = roundMoney(balance - stake);
        run = withCash({ stake, value: stake, streak: 0, bonusPct: 0, cashValue: 0 });
      }
      pick = market;
      return reply({ balance, run, pick: market });
    },

    settle(roundId) {
      if (!open || roundId !== round.id) return fail('ROUND_CLOSED');
      open = false;
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
      openRound(next);
      return reply({ next, outcome, run, balance, round });
    },

    cashOut() {
      if (!open) return fail('ROUND_CLOSED');
      if (!run || run.streak < 1) return fail('NO_RUN');
      const amount = run.cashValue;
      balance = roundMoney(balance + amount);
      run = null;
      pick = null;
      return reply({ amount, balance });
    },
  };
}
