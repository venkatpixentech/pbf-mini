// Self-check: node --experimental-strip-types --no-warnings src/core/pixi/GameConfigProxy.check.ts
// The game-level Pixi config validator.
import assert from 'node:assert/strict';

import { type PixiGameConfig, validatePixiConfig } from './GameConfigProxy.ts';

const burst = {
  count: 5,
  colors: ['white' as const],
  piece: { width: 4, height: 4 },
  origin: { x: 0.5, y: 0.5 },
  speed: { spreadX: 4, maxUp: 4, minUp: 1 },
  gravity: 0.2,
  spin: 0.2,
  reanchorMs: 100,
  fade: 0.05,
};

validatePixiConfig({ preload: [] });
validatePixiConfig({ preload: [{ alias: 'a', src: 'g/a.png' }], effects: { win: burst } });

const bad = (c: PixiGameConfig, text: RegExp) => assert.throws(() => validatePixiConfig(c, 'cfg'), text);
bad(
  {
    preload: [
      { alias: 'a', src: 'x.png' },
      { alias: 'a', src: 'y.png' },
    ],
  },
  /duplicate alias "a"/,
);
bad({ preload: [{ alias: '', src: 'x.png' }] }, /alias and a src/);
bad({ preload: [], effects: { win: { ...burst, fade: 0 } } }, /cfg\.effects\.win/);

// the Phase 3 sections: assets, bundles, spine, design
validatePixiConfig({
  preload: [],
  assets: [{ kind: 'atlas', alias: 'cards', src: 'g/{res}/cards.json' }],
  bundles: [{ id: 'home', assets: [{ alias: 'a', src: 'g/a.png' }] }],
  spine: {
    assets: [{ id: 'hero', skeleton: 'g/hero.skel', atlas: 'g/hero.atlas' }],
    views: { main: { asset: 'hero', defaultState: 'idle' } },
  },
  design: { width: 720, height: 960, fit: 'contain' },
});
bad({ preload: [], assets: [{ alias: '', src: 'a.png' }] }, /alias is required/);
bad({ preload: [], bundles: [{ id: '', assets: [] }] }, /needs an id/);
bad({ preload: [], spine: { assets: [], views: { main: { asset: 'nope' } } } }, /not a declared Spine asset/);
bad({ preload: [], design: { width: 0, height: 10 } }, /design/);

// sounds
validatePixiConfig({
  preload: [],
  sounds: { soundPath: 'g/sounds/', soundFiles: [{ name: 'win', playEvents: ['DONE'] }] },
});
bad({ preload: [], sounds: { soundPath: 'g/sounds', soundFiles: [] } }, /slash/);

console.log('GameConfigProxy.check: ok');
