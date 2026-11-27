// Game entry: the only file the core reads. Everything else in this folder belongs to the game.
// Keep imports here light: this file is in the boot bundle. The screen (and Pixi) loads through loadScreen.
import { defineGame } from 'core/game/defineGame';
import { mockInitError } from 'core/services/mockTransport';

import { createMockServer } from './api/mockServer';
import { higherLowerPixiConfig } from './pixi/config/game.config';

export default defineGame({
  id: 'higherlower',
  title: 'Higher or Lower',
  renderer: 'pixi',
  preload: higherLowerPixiConfig.preload,
  translations: { en: () => import('./i18n/en') },
  // MOCK: replace with the real backend client once the contract exists (docs/09-BACKEND-INTEGRATION.md, Q1).
  createApi: (launch) => createMockServer({ currency: launch.currency ?? 'GBP', initError: mockInitError() }),
  loadScreen: () => import('./HigherLowerScreen').then((m) => m.HigherLowerScreen),
});
