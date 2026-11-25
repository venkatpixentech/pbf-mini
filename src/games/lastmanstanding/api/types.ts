// Last Man Standing backend contract. The mock server implements it today; the real backend must implement
// the same shapes (docs/09-BACKEND-INTEGRATION.md). The server owns fixtures, match results, prizes and balance; the client
// only renders them. Fixture win/draw/loss odds are sent as display data (strength bars, planner colours).
import type { SessionErrorCode } from '../../../core/services/apiError.ts';

export type Team = { code: string; name: string; ovr: number; att: number; def: number; cre: number };
export type LeagueInfo = { id: string; name: string };
export type ModeInfo = { id: string; name: string; desc: string; top: number };

/** One fixture with the chances of a home win, a draw and an away win (they sum to 1). */
export type Fixture = { home: string; away: string; probs: [number, number, number] };

export type Goal = { m: number; s: 'h' | 'a'; who: string | null };
export type Chance = Goal & { how: string };
export type MatchResult = {
  home: string;
  away: string;
  outcome: 'H' | 'D' | 'A';
  homeGoals: number;
  awayGoals: number;
  goals: Goal[];
  chances: Chance[];
};

export type HistoryEntry = { gw: number; code: string; score: string; won: boolean; outcome: 'H' | 'D' | 'A' };

/** Everything the client needs to show a running game. */
export type Game = {
  id: string;
  league: string;
  mode: string;
  stake: number;
  teams: Team[];
  /** The whole fixture list, one array of fixtures per game week, visible from the start. */
  schedule: Fixture[][];
  /** Prize multipliers for rounds 1 to 20, priced on this fixture list. */
  ladder: number[];
  /** Exact chance of reaching each round with best play, for the first rounds (display only). */
  best: number[];
  /** Same chance when always backing the biggest OVR gap (display only). */
  gap: number[];
  gw: number;
  wins: number;
  used: string[];
  history: HistoryEntry[];
  over: boolean;
};

export type InitResponse = {
  balance: number;
  currency: string;
  stakes: number[];
  leagues: LeagueInfo[];
  modes: ModeInfo[];
};
export type StartResponse = { balance: number; game: Game };
export type PickResponse = {
  balance: number;
  game: Game;
  mine: string;
  won: boolean;
  /** Every result of the game week, including the picked team's match. */
  results: MatchResult[];
  /** Prize paid now (only for winning the final round), otherwise 0. */
  payout: number;
};
export type CashOutResponse = { balance: number; game: Game; amount: number };

export type ApiErrorCode =
  | SessionErrorCode
  | 'INSUFFICIENT_BALANCE'
  | 'INVALID_STAKE'
  | 'INVALID_LEAGUE'
  | 'INVALID_MODE'
  | 'GAME_ACTIVE'
  | 'NO_GAME'
  | 'GAME_OVER'
  | 'UNKNOWN_TEAM'
  | 'TEAM_USED'
  | 'CANNOT_CASH_OUT';
export { ApiError } from '../../../core/services/apiError.ts';

export interface LastManStandingApi {
  init(): Promise<InitResponse>;
  /** Takes the stake and deals a fixture list. Fails with GAME_ACTIVE while a game is still running. */
  start(league: string, mode: string, stake: number): Promise<StartResponse>;
  /** Back one team for the current game week; the server plays the whole week and settles the pick. */
  pick(gameId: string, code: string): Promise<PickResponse>;
  cashOut(gameId: string): Promise<CashOutResponse>;
  /** MOCK ONLY: demo wallet top-up back to the starting balance. A real backend does not offer this. */
  resetDemoBalance(): Promise<{ balance: number }>;
}
