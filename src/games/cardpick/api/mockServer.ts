// MOCK BACKEND for Card Pick. Stands in for the real server until its contract exists (docs/09-BACKEND-INTEGRATION.md, Q1).
// It owns the wallet and every outcome, exactly as the real server must; the UI only renders responses. One of three
// cards is the winner, chosen by the server after the stake is taken.
import type { SessionErrorCode } from '../../../core/services/apiError.ts';
import { mockTransport } from '../../../core/services/mockTransport.ts';
import { roundMoney } from '../../../core/services/money.ts';
import { CARD_COUNT, type CardPickApi } from './types.ts';

export const RTP = 0.96;
export const WIN_PROBABILITY = 1 / CARD_COUNT;
export const PAYOUT_MULTIPLIER = RTP / WIN_PROBABILITY;
export const STAKES = [1, 2, 5, 10, 20];

type Options = { latencyMs?: number; random?: () => number; currency?: string; initError?: SessionErrorCode | null };

export function createMockServer({
  latencyMs = 150,
  random = Math.random,
  currency = 'GBP',
  initError = null,
}: Options = {}): CardPickApi {
  let balance = 1000;
  const { reply, fail } = mockTransport(latencyMs);

  return {
    init() {
      if (initError) return fail(initError);
      return reply({ balance, currency, stakes: STAKES });
    },

    play(stake, pick) {
      if (!STAKES.includes(stake)) return fail('INVALID_STAKE');
      if (!Number.isInteger(pick) || pick < 0 || pick >= CARD_COUNT) return fail('INVALID_PICK');
      if (roundMoney(stake) > roundMoney(balance)) return fail('INSUFFICIENT_BALANCE');
      balance = roundMoney(balance - stake);
      const winningIndex = Math.min(CARD_COUNT - 1, Math.floor(random() * CARD_COUNT));
      const won = winningIndex === pick;
      const payout = won ? roundMoney(stake * PAYOUT_MULTIPLIER) : 0;
      balance = roundMoney(balance + payout);
      return reply({ pick, winningIndex, won, payout, balance });
    },
  };
}
