// Which blocking screen a failed boot shows. Plain TypeScript (no React) so it is checked in Node
// (loadQueue.check.ts).
//
// Session start (the game's `api.init()`) fails in one of three ways:
//   - the server answered with an error: the game's backend throws ApiError with the server's code
//   - no answer in time: LoadError TIMEOUT from the boot's timeout
//   - anything else: no usable server answer (offline, DNS, refused connection, a reply that could not be read).
//     Shown as a connection problem, not as an invalid session, because the server never said the session was bad.
import { ApiError } from '../services/apiError.ts';
import { LoadError } from './loadQueue.ts';

/** The blocking error screens; each has common.boot.<name>.title and .body keys. */
export type StartupErrorScreen =
  'maintenance' | 'sessionExpired' | 'sessionInvalid' | 'timeout' | 'network' | 'assetsFailed' | 'runtime';

// boot failure code -> the part of the common.boot.<name>.title / .body keys (core/i18n/en.ts)
const SCREENS: Record<string, StartupErrorScreen> = {
  MAINTENANCE: 'maintenance',
  SESSION_EXPIRED: 'sessionExpired',
  SESSION_INVALID: 'sessionInvalid',
  TIMEOUT: 'timeout',
  NETWORK: 'network',
  ASSETS_FAILED: 'assetsFailed',
  RUNTIME: 'runtime',
};

/** The boot failure code for a failed session start. */
export function sessionFailureCode(error: unknown): string {
  if (error instanceof ApiError) return error.code;
  if (error instanceof LoadError && error.code === 'TIMEOUT') return 'TIMEOUT';
  return 'NETWORK';
}

/** The error screen for a boot failure code. A server code the boot does not know is shown as "unable to start". */
export const startupErrorScreen = (code: string): StartupErrorScreen =>
  Object.prototype.hasOwnProperty.call(SCREENS, code) ? SCREENS[code] : 'sessionInvalid';
