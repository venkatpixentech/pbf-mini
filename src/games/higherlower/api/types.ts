import type { SessionErrorCode } from '../../../core/services/apiError.ts';
// Higher or Lower backend contract. The mock server implements it today; the real backend must
// implement the same shapes (docs/09-BACKEND-INTEGRATION.md). The client never decides outcomes or prices,
// and never decides when a round opens, closes or settles: the server owns the round timeline.
import type { Card } from '../pixi/view/CardRevealScene.ts';

export type { Card };

/** "At least" markets: H2 wins if next OVR >= current + 2, L1 if next <= current - 1. */
export type MarketId = 'H1' | 'H2' | 'H3' | 'L1' | 'L2' | 'L3';

export type Market = { id: MarketId; label: string; price: number; available: boolean };

/**
 * The server's timeline for one round, in SERVER time (ms). Betting is open from `opensAt` until `closesAt`; the
 * server rejects picks outside that window and settles the round itself. `serverTime` is when this snapshot was
 * made: the client uses it to learn the server clock (core/round/serverClock) and only to display countdowns.
 */
export type RoundTiming = { serverTime: number; opensAt: number; closesAt: number };

export type RoundInfo = { id: string; current: Card; markets: Market[]; timing: RoundTiming };

/** A run starts with a stake, multiplies by the price on every correct pick, and is lost on a wrong one. */
export type Run = { stake: number; value: number; streak: number; bonusPct: number; cashValue: number };

export type Outcome = 'won' | 'lost' | 'no-pick';

export type InitResponse = { balance: number; currency: string; stakes: number[]; round: RoundInfo };
export type PickResponse = { serverTime: number; balance: number; run: Run; pick: MarketId };
/** The settled round: the same answer however many times it is asked for (settlement happens once, on the server). */
export type ResultResponse = {
  serverTime: number;
  next: Card;
  outcome: Outcome;
  run: Run | null;
  balance: number;
  /** The next round; it may open later than now (`timing.opensAt`). */
  round: RoundInfo;
};
export type CashOutResponse = { serverTime: number; amount: number; balance: number };

export type ApiErrorCode =
  | SessionErrorCode
  | 'ROUND_CLOSED'
  | 'ROUND_NOT_OPEN'
  | 'ROUND_NOT_CLOSED'
  | 'INSUFFICIENT_BALANCE'
  | 'MARKET_UNAVAILABLE'
  | 'INVALID_STAKE'
  | 'NO_RUN';

export { ApiError } from '../../../core/services/apiError.ts';

export interface HigherLowerApi {
  init(): Promise<InitResponse>;
  /**
   * Pick a market for the open round. `stake` is used only when no run is active. Re-picking replaces the pick.
   * `requestId` is created once per user action and reused by retries: the server applies a request id once and
   * answers a repeat with the original response (a retry after a lost reply never takes the stake twice).
   */
  pick(roundId: string, market: MarketId, stake: number, requestId: string): Promise<PickResponse>;
  /**
   * The result of a round whose betting has closed. The server settled it at close; asking again returns the same
   * response. Asking before the server closed the round fails with ROUND_NOT_CLOSED (the client's clock was ahead).
   */
  result(roundId: string): Promise<ResultResponse>;
  cashOut(requestId: string): Promise<CashOutResponse>;
}
