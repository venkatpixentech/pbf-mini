import type { SessionErrorCode } from '../../../core/services/apiError.ts';
// Acca Crash backend contract. The mock server implements it today; the real backend must implement the
// same shapes (docs/09-BACKEND-INTEGRATION.md). The server owns the crash point, boosts, cash-outs and balance,
// and the round timeline: it opens and closes betting, starts the run and ends it by its own clock. The client
// only displays countdowns and polls the state; it never starts or settles a round.

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

/**
 * The server's timeline for one round, in SERVER time (ms). Betting is open from `opensAt` until `closesAt`; the run
 * starts when betting closes. `serverTime` is when this snapshot was made: the client uses it to learn the server
 * clock (core/round/serverClock) and only to display countdowns.
 */
export type RoundTiming = { serverTime: number; opensAt: number; closesAt: number };

export type RoundInfo = { id: string; cards: ScorerCard[]; timing: RoundTiming };

export type InitResponse = {
  balance: number;
  currency: string;
  stakes: number[];
  autoOptions: number[];
  round: RoundInfo;
  history: number[];
};
export type BetResponse = { serverTime: number; balance: number; bets: Bet[] };
/** Phases use the shared round vocabulary (core/round/roundTracker): bettingOpen, running, completed (crashed). */
export type StatusPhase = 'bettingOpen' | 'running' | 'completed';
export type StatusResponse = {
  roundId: string;
  phase: StatusPhase;
  /** Increases with every snapshot the server publishes: lets the client drop delayed or duplicate ones. */
  seq: number;
  serverTime: number;
  /** After the crash: server time at which the next round opens. */
  nextOpensAt: number | null;
  elapsedMs: number;
  multiplier: number;
  crashed: boolean;
  crashPoint: number | null; // revealed only after the crash
  goals: GoalEvent[];
  bets: Bet[];
  balance: number;
};
export type NextRoundResponse = { serverTime: number; round: RoundInfo; history: number[] };

export type ApiErrorCode =
  | SessionErrorCode
  | 'ROUND_CLOSED'
  | 'ROUND_NOT_OPEN'
  | 'ROUND_NOT_STARTED'
  | 'ROUND_NOT_READY'
  | 'INSUFFICIENT_BALANCE'
  | 'INVALID_STAKE'
  | 'INVALID_AUTO'
  | 'NO_BET'
  | 'BET_EXISTS';

export { ApiError } from '../../../core/services/apiError.ts';

export interface AccaCrashApi {
  init(): Promise<InitResponse>;
  /**
   * Betting phase only (the server's clock decides). One bet per panel per round. `requestId` is created once per
   * user action and reused by retries: the server applies a request id once and answers a repeat with the original
   * response, so a retry after a lost reply never takes the stake twice.
   */
  placeBet(
    roundId: string,
    panel: Panel,
    stake: number,
    autoCashOut: number | null,
    requestId: string,
  ): Promise<BetResponse>;
  cancelBet(roundId: string, panel: Panel, requestId: string): Promise<BetResponse>;
  /**
   * The state of the round, evaluated by the server at its own clock: bettingOpen, running (multiplier, goals) or
   * completed (crashed). The server starts the run when betting closes; the client only reads. Poll it (or replace
   * with a push channel); a snapshot with a lower `seq` than one already seen is stale.
   */
  status(roundId: string): Promise<StatusResponse>;
  cashOut(roundId: string, panel: Panel, requestId: string): Promise<StatusResponse>;
  /**
   * After the crash: the next round. Fails with ROUND_NOT_READY until the server has opened it; asking again once
   * it is open returns the same round.
   */
  next(): Promise<NextRoundResponse>;
}
