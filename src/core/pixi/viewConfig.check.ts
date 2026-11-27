// Self-check: node --experimental-strip-types --no-warnings src/core/pixi/viewConfig.check.ts
// The config validators accept a good config and reject each kind of broken one.
import assert from 'node:assert/strict';

import {
  type ElementConfig,
  type SpineAssetDef,
  type SpineViewConfig,
  ViewConfigError,
  validateCanvas,
  validateElements,
  validateInteractions,
  validateSpineAssets,
  validateSpineViews,
} from './viewConfig.ts';

const good = { heightPct: 30, minHeight: 200, maxHeight: 280 };
validateCanvas(good);
for (const bad of [
  { ...good, heightPct: 0 },
  { ...good, heightPct: 120 },
  { ...good, minHeight: 300 },
  { ...good, maxHeight: NaN },
  { ...good, minHeight: 0 },
]) {
  assert.throws(() => validateCanvas(bad), ViewConfigError);
}

const text: ElementConfig = {
  type: 'text',
  id: 'a',
  text: 'x',
  x: 0,
  y: 0,
  style: { font: 'body', size: 12, color: 'ink' },
};
const sprite: ElementConfig = { type: 'sprite', id: 'b', alias: 'x', x: 0, y: 0 };
validateElements([text, sprite, { type: 'group', id: 'g', x: 0, y: 0, children: [{ ...text, id: 'a' }] }]);

assert.throws(() => validateElements([text, { ...sprite, id: 'a' }]), /duplicate id/);
assert.throws(() => validateElements([{ ...text, id: '' }]), /id is required/);
assert.throws(() => validateElements([{ ...(text as object), text: undefined } as ElementConfig]), /text/);
assert.throws(() => validateElements([{ ...sprite, alias: '' }]), /alias/);
assert.throws(() => validateElements([{ ...text, x: NaN }]), /finite/);
assert.throws(() => validateElements([{ type: 'shape', id: 's', shape: 'circle', x: 0, y: 0, fill: 'ink' }]), /size/);
assert.throws(
  () => validateElements([{ type: 'shape', id: 's', shape: 'rect', x: 0, y: 0, width: 4, height: 4 }]),
  /fill or a stroke/,
);
assert.throws(
  () => validateElements([{ type: 'group', id: 'g', x: 0, y: 0, children: [text, { ...sprite, id: 'a' }] }]),
  /g\.a: duplicate id/,
);

// Spine assets and views
const spineAssets: SpineAssetDef[] = [
  { id: 'packOpen', skeleton: 'g/spines/Pack Open.json', atlas: 'g/spines/Pack Open.atlas' },
];
validateSpineAssets([...spineAssets, { id: 'fx', skeleton: 'g/spines/fx.skel', atlas: 'g/spines/fx.atlas' }]);
for (const [bad, why] of [
  [{ ...spineAssets[0], id: '' }, /id must/],
  [{ ...spineAssets[0], id: '1x' }, /id must/],
  [{ ...spineAssets[0], skeleton: 'a.txt' }, /skeleton/],
  [{ ...spineAssets[0], atlas: 'a.json' }, /atlas/],
] as const)
  assert.throws(() => validateSpineAssets([bad]), why);
assert.throws(() => validateSpineAssets([spineAssets[0], spineAssets[0]]), /duplicate id/);

const view: SpineViewConfig = {
  asset: 'packOpen',
  defaultState: 'packAnimation',
  skin: ['default', 'Gold Pack'],
  defaultMix: 0.2,
  mixes: [{ from: 'a', to: 'b', duration: 0.3 }],
  place: { x: 10, y: 20, scale: 0.5, pivot: { x: 1, y: 2 }, fit: { width: 300, height: 540, mode: 'contain' } },
};
validateSpineViews({ pack: view }, spineAssets);
for (const [bad, why] of [
  [{ ...view, asset: 'nope' }, /not a declared Spine asset/],
  [{ ...view, defaultMix: -1 }, /defaultMix/],
  [{ ...view, mixes: [{ from: '', to: 'b', duration: 0 }] }, /from.*to/],
  [{ ...view, mixes: [{ from: 'a', to: 'b', duration: NaN }] }, /duration/],
  [{ ...view, place: { scale: 0 } }, /scale/],
  [{ ...view, place: { fit: { width: 0, height: 5, mode: 'cover' as const } } }, /fit needs/],
  [{ ...view, place: { fit: { width: 5, height: 5, mode: 'stretch' as never } } }, /fit.mode/],
  [{ ...view, skin: [''] }, /skin/],
] as const)
  assert.throws(() => validateSpineViews({ v: bad }, spineAssets), why);

// bitmap text, animated sprite, spine placeholder, new shapes, text fitting fields
validateElements([
  { type: 'bitmapText', id: 'b', x: 0, y: 0, text: '1', font: 'Digits', size: 20, color: 'white' },
  { type: 'animatedSprite', id: 'w', x: 0, y: 0, prefix: 'win_', postfix: '.png', start: 0, end: 9, loop: true },
  { type: 'animatedSprite', id: 'one', x: 0, y: 0, image: 'frame' },
  { type: 'spine', id: 'hero', x: 0, y: 0, view: 'main' },
  { type: 'shape', id: 'arc', x: 0, y: 0, shape: 'arc', radius: 10, startAngle: 0, endAngle: 3, fill: 'ink' },
  { type: 'shape', id: 'poly', x: 0, y: 0, shape: 'polygon', points: [0, 0, 10, 0, 5, 8], fill: 'ink' },
  { type: 'shape', id: 'grad', x: 0, y: 0, shape: 'gradientRect', width: 40, height: 10, colors: [1, 2] },
  { ...(text as object), id: 'fit', maxWidth: 80, maxLines: 2 } as ElementConfig,
]);
for (const [bad, why] of [
  [{ type: 'bitmapText', id: 'b', x: 0, y: 0, text: '1', font: '', size: 20, color: 'white' }, /needs a font/],
  [{ type: 'bitmapText', id: 'b', x: 0, y: 0, font: 'F', size: 20, color: 'white' }, /needs `text`/],
  [
    { type: 'animatedSprite', id: 'w', x: 0, y: 0, prefix: 'a', postfix: 'b', start: 5, end: 1 },
    /animatedSprite needs/,
  ],
  [{ type: 'spine', id: 'h', x: 0, y: 0, view: '' }, /needs a view name/],
  [{ type: 'shape', id: 'a', x: 0, y: 0, shape: 'arc', radius: 5, fill: 'ink' }, /startAngle/],
  [{ type: 'shape', id: 'p', x: 0, y: 0, shape: 'polygon', points: [0, 0, 1, 1], fill: 'ink' }, /3 points/],
  [{ type: 'shape', id: 'g', x: 0, y: 0, shape: 'gradientRect', width: 4, height: 4, colors: [1] }, /2 colors/],
] as const)
  assert.throws(() => validateElements([bad as unknown as ElementConfig]), why);

// interactive blocks: a unique event, sensible numbers, nested groups included
const tappable = (id: string, interactive?: ElementConfig['interactive']): ElementConfig => ({
  type: 'shape',
  id,
  x: 0,
  y: 0,
  shape: 'rect',
  width: 5,
  height: 5,
  fill: 1,
  interactive,
});
validateInteractions([
  tappable('a', { event: 'a', hitPadding: 4, minTarget: 0, disabledAlpha: 0.3 }),
  tappable('plain'),
  { type: 'group', id: 'g', x: 0, y: 0, children: [tappable('b', { event: 'b' })] },
]);
for (const [list, why] of [
  [[tappable('a', { event: '' })], /event is required/],
  [[tappable('a', { event: 'x' }), tappable('b', { event: 'x' })], /duplicate event "x"/],
  [
    [{ type: 'group', id: 'g', x: 0, y: 0, children: [tappable('b', { event: 'x' })] }, tappable('c', { event: 'x' })],
    /duplicate event "x"/,
  ],
  [[tappable('a', { event: 'a', hitPadding: -1 })], /hitPadding/],
  [[tappable('a', { event: 'a', minTarget: NaN })], /minTarget/],
  [[tappable('a', { event: 'a', disabledAlpha: 2 })], /disabledAlpha/],
] as const)
  assert.throws(() => validateInteractions(list as unknown as ElementConfig[]), why);

console.log('viewConfig.check: ok');
