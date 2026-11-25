// Game entry: the only file the core reads. Everything else in this folder belongs to the game.
import { defineGame } from 'core/game/defineGame';
import { mockInitError } from 'core/services/mockTransport';

import { createMockServer } from './api/mockServer';
import { HigherLowerScreen } from './HigherLowerScreen';
import { CARD_REVEAL_ASSETS } from './scenes/CardRevealScene';

export default defineGame({
  id: 'higherlower',
  title: 'Higher or Lower',
  preload: CARD_REVEAL_ASSETS,
  // MOCK: replace with the real backend client once the contract exists (doc 10 Q1).
  createApi: (launch) => createMockServer({ currency: launch.currency ?? 'GBP', initError: mockInitError() }),
  Screen: HigherLowerScreen,
});
