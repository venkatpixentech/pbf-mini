// Shared English dictionary: text every game shows (boot screens, balance, stake, common errors).
// Keys are flat and prefixed `common.`; a game's own dictionary uses its own prefix (docs/08-I18N-TRANSLATIONS.md).
// `{name}` marks a value filled in at run time. English is the fallback for every other language.
const en = {
  'common.balance': 'Balance',
  'common.stake': 'Stake',
  'common.reload': 'Reload',
  'common.lobby': 'Lobby',
  'common.loading': 'Loading {percent}%',
  'common.boot.maintenance.title': 'Under maintenance',
  'common.boot.maintenance.body': 'The game is unavailable right now. Please try again later.',
  'common.boot.sessionExpired.title': 'Session expired',
  'common.boot.sessionExpired.body': 'Your session has ended. Please reload the game.',
  'common.boot.sessionInvalid.title': 'Unable to start',
  'common.boot.sessionInvalid.body': 'We could not start your session. Please reload the game.',
  'common.boot.timeout.title': 'Taking too long',
  'common.boot.timeout.body': 'The game server did not respond in time. Please try again.',
  'common.boot.assetsFailed.title': 'Unable to load',
  'common.boot.assetsFailed.body': 'Some game files could not be downloaded. Check your connection and try again.',
  'common.error.generic': 'Something went wrong.',
  'common.error.INSUFFICIENT_BALANCE': 'Not enough balance for that stake.',
  'common.error.INVALID_STAKE': 'That stake is not allowed.',
  'common.display.error': 'Display error ({kind}).',
  'common.boot.network.title': 'Connection problem',
  'common.boot.network.body': 'We could not reach the game server. Check your connection and try again.',
  'common.boot.runtime.title': 'Something went wrong',
  'common.boot.runtime.body': 'The game stopped unexpectedly. Please reload the game.',
} as const;

export default en;
export type CoreKey = keyof typeof en;
