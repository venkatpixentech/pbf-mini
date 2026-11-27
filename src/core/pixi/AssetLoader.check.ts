// Self-check: node --experimental-strip-types --no-warnings src/core/pixi/AssetLoader.check.ts
// Asset definitions: validation, the files each kind stands for, and bundles; plus the generic registry on plain assets.
import assert from 'node:assert/strict';

import { expandAsset, expandAssets, findBundle, sameAsset } from './AssetLoaderStep.ts';
import { createAssetRegistry } from './AssetRegistry.ts';
import { type AssetDef, validateAssets, validateBundles } from './viewConfig.ts';

const tick = () => new Promise((r) => setTimeout(r, 0));

// the old StageAsset shape is still valid, and every kind validates
const defs: AssetDef[] = [
  { alias: 'icon', src: 'g/images/icon.svg' },
  { kind: 'atlas', alias: 'cards', src: 'g/images/{res}/cards.json' },
  { kind: 'sequence', alias: 'win', src: 'g/images/{res}/win{n}.json', sheets: { '@1x': 3, '@0.5x': 2 } },
  { kind: 'font', alias: 'score', family: 'ScoreFont', src: 'g/fonts/score.woff2' },
  { kind: 'bmpfont', alias: 'digits', src: 'g/fonts/digits.fnt' },
];
validateAssets(defs);
for (const [bad, why] of [
  [{ alias: '', src: 'a.png' }, /alias is required/],
  [{ alias: 'a', src: '' }, /src is required/],
  [{ kind: 'sequence', alias: 'w', src: 'w.json', sheets: 2 }, /needs \{n\}/],
  [{ kind: 'sequence', alias: 'w', src: 'w{n}.json', sheets: 0 }, /sheets/],
  [{ kind: 'sequence', alias: 'w', src: 'w{n}.json', sheets: { '@1x': 2, '@0.5x': 1.5 } }, /sheets/],
  [{ kind: 'font', alias: 'f', src: 'f.woff2', family: '' }, /family/],
  [{ kind: 'gif', alias: 'g', src: 'g.gif' }, /unknown kind/],
] as const)
  assert.throws(() => validateAssets([bad as unknown as AssetDef]), why);
assert.throws(() => validateAssets([defs[0], { alias: 'icon', src: 'x.png' }]), /duplicate alias/);

// {res} and {n} are filled in; a sequence is one entry per sheet and its count follows the resolution
assert.deepEqual(expandAsset(defs[1], '@0.5x'), [
  { alias: 'cards', src: 'g/images/@0.5x/cards.json', loader: 'asset' },
]);
assert.deepEqual(
  expandAsset(defs[2], '@1x').map((c) => [c.alias, c.src]),
  [
    ['win0', 'g/images/@1x/win0.json'],
    ['win1', 'g/images/@1x/win1.json'],
    ['win2', 'g/images/@1x/win2.json'],
  ],
);
assert.equal(expandAsset(defs[2], '@0.5x').length, 2);
assert.deepEqual(expandAsset(defs[3], '@1x'), [
  { alias: 'score', src: 'g/fonts/score.woff2', loader: 'font', family: 'ScoreFont' },
]);
assert.equal(expandAsset(defs[4], '@1x')[0].loader, 'bmpfont');
assert.equal(expandAssets(defs, '@1x').length, 1 + 1 + 3 + 1 + 1);
assert.ok(sameAsset(expandAsset(defs[0], '@1x')[0], { alias: 'icon', src: 'g/images/icon.svg', loader: 'asset' }));
assert.ok(!sameAsset(expandAsset(defs[1], '@1x')[0], expandAsset(defs[1], '@0.5x')[0]));

// bundles: unique ids, valid assets, one alias never means two files
const bundles = [
  { id: 'home', assets: [defs[0], defs[1]] },
  { id: 'store', assets: [defs[0], defs[4]] }, // icon shared with the same file: fine
];
validateBundles(bundles);
assert.throws(() => validateBundles([bundles[0], { id: 'home', assets: [] }]), /duplicate bundle id/);
assert.throws(() => validateBundles([{ id: '', assets: [] }]), /needs an id/);
assert.throws(
  () => validateBundles([bundles[0], { id: 'other', assets: [{ alias: 'icon', src: 'g/images/different.svg' }] }]),
  /also used with another file/,
);
assert.equal(findBundle(bundles, 'store').id, 'store');
assert.throws(() => findBundle(bundles, 'nope'), /"nope".*home, store/);

// the registry works for plain assets (keyed by alias) with the same lifecycle as Spine: share, release once, retry after a failure
{
  const log: string[] = [];
  let failNext = false;
  const registry = createAssetRegistry<{ alias: string; src: string }>(
    {
      async load(d) {
        log.push(`load:${d.alias}`);
        if (failNext) {
          failNext = false;
          throw new Error('network');
        }
      },
      async unload(d) {
        log.push(`unload:${d.alias}`);
      },
    },
    { keyOf: (d) => d.alias, same: (a, b) => a.src === b.src, label: 'Asset' },
  );
  const a = registry.acquire([{ alias: 'x', src: '1.png' }]);
  const b = registry.acquire([{ alias: 'x', src: '1.png' }]);
  await Promise.all([a.ready, b.ready]);
  assert.deepEqual(log, ['load:x']);
  a.release();
  await tick();
  assert.ok(!log.includes('unload:x'));
  b.release();
  await tick();
  assert.deepEqual(log, ['load:x', 'unload:x']);
  failNext = true;
  const bad = registry.acquire([{ alias: 'x', src: '1.png' }]);
  await assert.rejects(bad.ready, /network/);
  bad.release();
  await tick();
  const retry = registry.acquire([{ alias: 'x', src: '1.png' }]);
  await retry.ready;
  assert.equal(registry.stats().x.loaded, true);
  assert.throws(() => registry.acquire([{ alias: 'x', src: 'other.png' }]), /Asset "x" is already in use/);
}

console.log('AssetLoader.check: ok');
