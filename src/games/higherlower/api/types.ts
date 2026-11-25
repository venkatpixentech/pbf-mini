import type { SessionErrorCode } from '../../../core/services/apiError.ts';
// Higher or Lower backend contract. The mock server implements it today; the real backend must
// implement the same shapes (doc 07 section 6). The client never decides outcomes or prices.
import type { Card } from '../scenes/CardRevealScene.ts';

export type { Card };

/** "At least" markets: H2 wins if next OVR >= current + 2, L1 if next <= current - 1. */
export type MarketId = 'H1' | 'H2' | 'H3' | 'L1' | 'L2' | 'L3';

export type Market = { id: MarketId; label: string; price: number; available: boolean };

export type RoundInfo = { id: string; current: Card; markets: Market[] };

/** A run starts with a stake, multiplies by the price on every correct pick, and is lost on a wrong one. */
export type Run = { stake: number; value: number; streak: number; bonusPct: number; cashValue: number };

export type Outcome = 'won' | 'lost' | 'no-pick';

export type InitResponse = { balance: number; currency: string; stakes: number[]; round: RoundInfo };
export type PickResponse = { balance: number; run: Run; pick: MarketId };
export type SettleResponse = { next: Card; outcome: Outcome; run: Run | null; balance: number; round: RoundInfo };
export type CashOutResponse = { amount: number; balance: number };

export type ApiErrorCode =
  SessionErrorCode | 'ROUND_CLOSED' | 'INSUFFICIENT_BALANCE' | 'MARKET_UNAVAILABLE' | 'INVALID_STAKE' | 'NO_RUN';

export { ApiError } from '../../../core/services/apiError.ts';

export interface HigherLowerApi {
  init(): Promise<InitResponse>;
  /** Pick a market for the open round. `stake` is used only when no run is active. Re-picking replaces the pick. */
  pick(roundId: string, market: MarketId, stake: number): Promise<PickResponse>;
  /** Close the round: the server draws the next card and settles the pick. */
  settle(roundId: string): Promise<SettleResponse>;
  cashOut(): Promise<CashOutResponse>;
}
