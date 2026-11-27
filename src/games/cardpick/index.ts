// Game entry: the only file the core reads. Everything else in this folder belongs to the game.
// Keep imports here light: this file is in the boot bundle. The screen (and Pixi, and audio) loads through loadScreen.
import { defineGame } from 'core/game/defineGame';
import { mockInitError, mockRandom } from 'core/services/mockTransport';

import { createMockServer } from './api/mockServer';
import { cardpickPixiConfig } from './pixi/config/game.config';

export default defineGame({
  id: 'cardpick',
  title: 'Card Pick',
  // 'pixi' when the first screen has a <PixiStage critical>; 'dom' keeps Pixi out of the boot entirely
  renderer: 'pixi',
  preload: cardpickPixiConfig.preload, // Pixi assets needed by the first screen
  // MOCK: replace with the real backend client once the contract exists (docs/09-BACKEND-INTEGRATION.md, Q1).
  createApi: (launch) =>
    createMockServer({ currency: launch.currency ?? 'GBP', initError: mockInitError(), random: mockRandom() }),
  loadScreen: () => import('./CardPickScreen').then((m) => m.CardPickScreen),
});
