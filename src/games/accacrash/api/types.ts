import type { SessionErrorCode } from '../../../core/services/apiError.ts';
// Acca Crash backend contract. The mock server implements it today; the real backend must implement the
// same shapes (doc 07 section 6). The server owns the crash point, boosts, cash-outs and balance.

export type Tier = 'gold' | 'silver' | 'bronze';
export type Panel = 0 | 1;
export type Nation = 'Brazil' | 'England' | 'France' | 'Germany' | 'Italy' | 'Portugal' | 'Spain' | 'Turkey' | 'Random';
export const NATIONS: Nation[] = [
  'Brazil',
  'England',
  'France',
  'Germany',
  'Italy',
  'Portugal',
  'Spain',
  'Turkey',
  'Random',
];

/** Dealt each round. When this player scores during the run, the multiplier jumps by `boost`. */
export type ScorerCard = { id: string; name: string; club: string; nation: Nation; tier: Tier; boost: number };

export type GoalEvent = { atMs: number; minute: number; scorer: string; club: string; mine: boolean; boost: number };

export type BetStatus = 'placed' | 'cashed' | 'lost';
export type Bet = {
  panel: Panel;
  stake: number;
  autoCashOut: number | null;
  status: BetStatus;
  cashedAt: number | null;
  payout: number;
};

export type RoundInfo = { id: string; cards: ScorerCard[] };

export type InitResponse = {
  balance: number;
  currency: string;
  stakes: number[];
  autoOptions: number[];
  round: RoundInfo;
  history: number[];
};
export type BetResponse = { balance: number; bets: Bet[] };
export type StatusResponse = {
  elapsedMs: number;
  multiplier: number;
  crashed: boolean;
  crashPoint: number | null; // revealed only after the crash
  goals: GoalEvent[];
  bets: Bet[];
  balance: number;
};
export type NextRoundResponse = { round: RoundInfo; history: number[] };

export type ApiErrorCode =
  | SessionErrorCode
  | 'ROUND_CLOSED'
  | 'INSUFFICIENT_BALANCE'
  | 'INVALID_STAKE'
  | 'INVALID_AUTO'
  | 'NO_BET'
  | 'BET_EXISTS';

export { ApiError } from '../../../core/services/apiError.ts';

export interface AccaCrashApi {
  init(): Promise<InitResponse>;
  /** Betting phase only. One bet per panel per round. */
  placeBet(roundId: string, panel: Panel, stake: number, autoCashOut: number | null): Promise<BetResponse>;
  cancelBet(roundId: string, panel: Panel): Promise<BetResponse>;
  /** Close betting and start the run. In the real game the server does this on its own schedule. */
  start(roundId: string): Promise<StatusResponse>;
  /** Current state of the run, evaluated by the server. Poll while running (or replace with a push channel). */
  status(roundId: string): Promise<StatusResponse>;
  cashOut(roundId: string, panel: Panel): Promise<StatusResponse>;
  /** After the crash: open the next round. */
  next(): Promise<NextRoundResponse>;
}
