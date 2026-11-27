// Self-check: node --experimental-strip-types --no-warnings src/games/cardpick/pixi/config/config.check.ts
// The game's Pixi config and its elements are valid, and every card is a tap target the scene can read back.
import assert from 'node:assert/strict';

import { validatePixiConfig } from '../../../../core/pixi/GameConfigProxy.ts';
import { validateCanvas, validateElements } from '../../../../core/pixi/viewConfig.ts';
import { CARD_COUNT } from '../../api/types.ts';
import { cardIndex, CARD, cardpickCanvas, cardpickElements, cardpickPixiConfig, cardTarget } from './game.config.ts';

validatePixiConfig(cardpickPixiConfig, 'cardpickPixiConfig');
validateCanvas(cardpickCanvas, 'cardpickCanvas');
validateElements(cardpickElements, 'cardpickElements');

assert.equal(CARD.xs.length, CARD_COUNT, 'one position per card');
const design = cardpickPixiConfig.design;
for (const x of CARD.xs)
  assert.ok(x - CARD.width / 2 >= 0 && x + CARD.width / 2 <= design.width, 'every card sits inside the design width');
assert.ok(CARD.y - CARD.height / 2 >= 0 && CARD.y + CARD.height / 2 <= design.height, 'and inside its height');
for (let i = 1; i < CARD_COUNT; i++) assert.ok(CARD.xs[i] - CARD.xs[i - 1] > CARD.width, 'cards do not overlap');

// every card is an element with its own tap target, and the target maps back to its index
const taps = cardpickElements.filter((e) => 'interactive' in e && e.interactive);
assert.equal(taps.length, CARD_COUNT);
for (let i = 0; i < CARD_COUNT; i++) {
  const el = cardpickElements.find((e) => e.id === cardTarget(i));
  assert.ok(el && 'interactive' in el && el.interactive?.event === cardTarget(i), `card ${i} is tappable`);
  assert.equal(cardIndex(cardTarget(i)), i);
}
assert.equal(cardIndex('mark-0'), -1);
assert.equal(cardIndex('card-x'), -1);

console.log('cardpick config.check: ok');
