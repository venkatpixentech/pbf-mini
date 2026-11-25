// Game entry: the only file the core reads. Everything else in this folder belongs to the game.
// Keep imports here light: this file is in the boot bundle. The screen loads through loadScreen.
import { defineGame } from 'core/game/defineGame';
import { mockInitError } from 'core/services/mockTransport';

import { createMockServer } from './api/mockServer';

export default defineGame({
  id: 'lastmanstanding',
  title: 'Last Man Standing',
  renderer: 'dom', // plain React: the boot never loads Pixi for this game
  preload: [],
  // MOCK: replace with the real backend client once the contract exists (docs/09-BACKEND-INTEGRATION.md, Q1).
  createApi: (launch) => createMockServer({ currency: launch.currency ?? 'GBP', initError: mockInitError() }),
  loadScreen: () => import('./LastManStandingScreen').then((m) => m.LastManStandingScreen),
});
