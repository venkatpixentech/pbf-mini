// Card Pick backend contract. The mock server implements it today; the real backend must implement
// the same shapes. The client never decides outcomes, prices or balance.
import type { SessionErrorCode } from '../../../core/services/apiError.ts';

export const CARD_COUNT = 3;

export type InitResponse = { balance: number; currency: string; stakes: number[] };
/** `pick` is the card the player chose, `winningIndex` the card the server turned over as the winner. */
export type PlayResponse = { pick: number; winningIndex: number; won: boolean; payout: number; balance: number };

export type ApiErrorCode = SessionErrorCode | 'INSUFFICIENT_BALANCE' | 'INVALID_STAKE' | 'INVALID_PICK';
export { ApiError } from '../../../core/services/apiError.ts';

export interface CardPickApi {
  init(): Promise<InitResponse>;
  play(stake: number, pick: number): Promise<PlayResponse>;
}
