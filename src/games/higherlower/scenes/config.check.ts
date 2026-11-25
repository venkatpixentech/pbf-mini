// Self-check: node --experimental-strip-types --no-warnings src/games/higherlower/scenes/config.check.ts
// The card and confetti configs are valid and the card face binds only keys the scene supplies.
import assert from 'node:assert/strict';

import { validateCanvas, validateElements } from '../../../core/pixi/viewConfig.ts';
import { confettiConfig } from '../confetti.config.ts';
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

// confetti
assert.ok(confettiConfig.count > 0 && confettiConfig.colors.length > 0);
assert.ok(confettiConfig.fade > 0, 'pieces must fade so the effect ends');

console.log('higherlower config.check: ok');
