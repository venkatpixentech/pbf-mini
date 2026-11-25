// Game entry: the only file the core reads. Everything else in this folder belongs to the game.
import { defineGame } from 'core/game/defineGame';
import { mockInitError } from 'core/services/mockTransport';

import { AccaCrashScreen } from './AccaCrashScreen';
import { createMockServer } from './api/mockServer';

export default defineGame({
  id: 'accacrash',
  title: 'Acca Crash',
  preload: [],
  // MOCK: replace with the real backend client once the contract exists (doc 10 Q1).
  createApi: (launch) => createMockServer({ currency: launch.currency ?? 'GBP', initError: mockInitError() }),
  Screen: AccaCrashScreen,
});
