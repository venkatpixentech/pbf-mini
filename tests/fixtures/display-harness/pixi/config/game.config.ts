// Config of the display harness, laid out like a game's pixi/config/game.config.ts: the assets, bundles and design size
// the shared core reads, and the view's element list. PBF game 1 art (an atlas and a bitmap font) and a core font stand in
// for a game's own assets.
import type { PixiGameConfig } from 'core/pixi/GameConfigProxy';
import type { AssetDef, ElementConfig, InteractionConfig } from 'core/pixi/viewConfig';

const badges: AssetDef = { kind: 'atlas', alias: 'badges', src: 'displayprobe/images/{res}/badges.json' };
const digits: AssetDef = { kind: 'bmpfont', alias: 'digits', src: 'displayprobe/fonts/digits.fnt' };
const probeFont: AssetDef = {
  kind: 'font',
  alias: 'probeFont',
  family: 'ProbeFont',
  src: 'displayprobe/fonts/Probe.woff2',
};

export const game = {
  preload: [],
  assets: [badges, digits, probeFont],
  // two bundles that overlap on one alias (the same file), to release independently
  bundles: [
    { id: 'cards', assets: [badges, digits] },
    { id: 'fonts', assets: [badges, probeFont] },
  ],
  design: { width: 720, height: 960, fit: 'contain' },
} satisfies PixiGameConfig;

/** A sequence of spritesheets: two sheets at full size, one at half size. */
export const seqAssets: AssetDef[] = [
  { kind: 'sequence', alias: 'seq', src: 'displayprobe/images/{res}/seq{n}.json', sheets: { '@1x': 2, '@0.5x': 1 } },
];

/** An asset that does not exist (a deterministic 404). */
export const badAssets: AssetDef[] = [{ alias: 'missing', src: 'displayprobe/images/missing.png' }];

export type Kind = 'cards' | 'seq' | 'bad' | 'plain' | 'tap' | 'strip' | 'remote';
export const assetsOf = (kind: Kind): AssetDef[] =>
  kind === 'cards' ? game.assets : kind === 'seq' ? seqAssets : kind === 'bad' ? badAssets : [];

/** Everything sits inside the 720 x 960 design, with a frame around the edge. */
export const elements: ElementConfig[] = [
  {
    type: 'shape',
    id: 'frame',
    x: 360,
    y: 480,
    shape: 'roundRect',
    width: 700,
    height: 940,
    radius: 24,
    stroke: { width: 6, color: 'white' },
  },
  { type: 'sprite', id: 'badge', x: 360, y: 220, alias: 'goldBadge' },
  { type: 'bitmapText', id: 'score', x: 360, y: 420, text: '12345', font: 'degularblackbmp', size: 96, color: 'white' },
  {
    type: 'text',
    id: 'caption',
    x: 360,
    y: 620,
    text: 'A very long caption that has to shrink to fit',
    style: { font: 'body', size: 60, color: 'white' },
    maxWidth: 560,
  },
  {
    type: 'text',
    id: 'wrapped',
    x: 360,
    y: 760,
    text: 'one two three four five six seven eight nine ten',
    style: { font: 'body', size: 50, color: 'white', align: 'center', wordWrapWidth: 420 },
    maxLines: 2,
  },
];

const box = (
  id: string,
  x: number,
  y: number,
  size: number,
  color: number,
  interactive?: InteractionConfig,
): ElementConfig => ({
  type: 'shape',
  id,
  x,
  y,
  shape: 'rect',
  width: size,
  height: size,
  fill: color,
  ...(interactive ? { interactive } : {}),
});

/**
 * The interaction stage: small tappable squares in the 720 x 960 design. `one` and `two` are close together (a gap of 10 design
 * pixels), `pad` has a hit padding, `edge` sits in the top-left corner, `off` starts disabled and `plain` is not interactive.
 */
export const tapElements: ElementConfig[] = [
  box('one', 200, 300, 30, 0xff5533, { event: 'one' }),
  box('two', 240, 300, 30, 0x33ff55, { event: 'two' }),
  box('pad', 400, 300, 30, 0x3355ff, { event: 'pad', hitPadding: 20, minTarget: 0 }),
  box('edge', 10, 10, 16, 0xffff33, { event: 'edge' }),
  box('off', 560, 300, 60, 0xff33ff, { event: 'off', disabled: true }),
  box('plain', 360, 600, 60, 0xffffff),
  { type: 'group', id: 'nested', x: 0, y: 0, children: [box('deep', 360, 800, 60, 0x33ffff, { event: 'deep' })] },
];
