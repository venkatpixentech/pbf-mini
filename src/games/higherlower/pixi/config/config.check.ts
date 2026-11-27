// Self-check: node --experimental-strip-types --no-warnings src/games/higherlower/pixi/config/config.check.ts
// The card config and the game-level Pixi config (with its confetti) are valid and the card face binds only keys the scene supplies.
import assert from 'node:assert/strict';

import { validateCanvas, validateElements } from '../../../../core/pixi/viewConfig.ts';
import { validatePixiConfig } from '../../../../core/pixi/GameConfigProxy.ts';
import { higherLowerPixiConfig } from './game.config.ts';
import { BACK, cardRevealConfig, FACE, VS } from './cardReveal.config.ts';

validateCanvas(cardRevealConfig.canvas, 'cardReveal.canvas');
validateElements(FACE, 'FACE');
validateElements(BACK, 'BACK');
validateElements(VS, 'VS');

// every bind / fillBind / colorBind / alias token in the face must be a key CardRevealScene passes
const supplied = new Set([
  'name',
  'club',
  'position',
  'nation',
  'ovr',
  'attack',
  'creativity',
  'defence',
  'tier',
  'tierName',
  'face',
  'rim',
]);
const used = new Set<string>();
const scan = (list: unknown[]) => {
  for (const e of list as Array<Record<string, unknown>>) {
    for (const k of ['bind', 'fillBind']) if (typeof e[k] === 'string') used.add(e[k] as string);
    const stroke = e.stroke as { colorBind?: string } | undefined;
    if (stroke?.colorBind) used.add(stroke.colorBind);
    if (typeof e.alias === 'string') for (const m of e.alias.matchAll(/\{(\w+)\}/g)) used.add(m[1]);
    if (Array.isArray(e.children)) scan(e.children);
  }
};
scan(FACE);
for (const key of used) assert.ok(supplied.has(key), `FACE binds "${key}" but the scene does not supply it`);

// the reveal timings run in order and finish by revealMs
const T = cardRevealConfig.timings;
assert.ok(T.flipMs < T.badgeFrom && T.badgeFrom < T.nameFrom && T.nameFrom < T.positionFrom);
assert.ok(T.positionFrom < T.teamFrom && T.teamFrom < T.statsFrom && T.statsFrom < T.tierFrom);
assert.ok(T.rollFrom < T.rollEnd && T.rollEnd + T.popMs <= T.revealMs);

// the game-level Pixi config (preload and the win confetti burst)
validatePixiConfig(higherLowerPixiConfig, 'higherLowerPixiConfig');

console.log('higherlower config.check: ok');
