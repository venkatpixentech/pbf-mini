// Typed config for canvas views. A game keeps one config file per view and edits it to change the canvas
// portion, the layout, the styling, the timings and the assets; the View class only draws and animates.
import type { ColorName, FontName } from './theme';

/** How much of the screen the canvas area takes. Applied by <CanvasFrame>. */
export type CanvasConfig = {
  /** Height as a percentage of the visible screen height. */
  heightPct: number;
  minHeight: number;
  maxHeight: number;
};

/** CSS height for a canvas portion: a share of the screen, kept between a minimum and a maximum. */
// dvh follows the mobile browser bar; older browsers without it fall back to vh
const heightUnit = typeof CSS !== 'undefined' && CSS.supports?.('height', '1dvh') ? 'dvh' : 'vh';
export const canvasHeight = (c: CanvasConfig) =>
  `clamp(${c.minHeight}px, ${c.heightPct}${heightUnit}, ${c.maxHeight}px)`;

/** A colour: a theme name, or a raw 0xRRGGBB number. */
export type ColorRef = ColorName | number;

export type TextStyleConfig = {
  font: FontName;
  size: number;
  weight?: '400' | '600' | '700' | '800' | '900';
  color: ColorRef;
  letterSpacing?: number;
  align?: 'left' | 'center' | 'right';
  /** Wrap the text at this width (needed for `maxLines` to mean anything). */
  wordWrapWidth?: number;
};

/**
 * Makes an element tappable (see UIUtil.bindInteractions). `event` names the target in the events a scene reports to React and
 * must be unique in the scene. `hitPadding` grows the hit area by that many of the object's own units per side; `minTarget`
 * (CSS pixels, default 44, 0 turns it off) grows it further so it is never smaller than that on screen.
 */
export type InteractionConfig = {
  event: string;
  cursor?: string;
  hitPadding?: number;
  minTarget?: number;
  /** Alpha while disabled (default 0.5). */
  disabledAlpha?: number;
  /** Start disabled (default enabled). */
  disabled?: boolean;
};

type Base = {
  /** Name used to find the built object (`getChildByLabel`) and to bind data. */
  id: string;
  x: number;
  y: number;
  alpha?: number;
  interactive?: InteractionConfig;
};

/**
 * `text` is shown as is; `bind` takes the value from the data given to buildElements; `textKey` is a translation
 * key (it may contain `{token}` filled from the data, e.g. `tier.{tier}`, and the data is also passed to the
 * translation as its values). A `textKey` text follows language switches (relabelTexts).
 */
export type TextElement = Base & {
  type: 'text';
  text?: string;
  bind?: string;
  textKey?: string;
  upper?: boolean;
  /** Anchor 0..1, default 0.5 0.5. */
  anchor?: { x: number; y: number };
  style: TextStyleConfig;
  /** Shrink the font until the text is at most this wide (the legacy maxWidth). Re-applied on a language switch. */
  maxWidth?: number;
  /** Shrink the font until the text wraps to at most this many lines (the legacy maxLines). */
  maxLines?: number;
};

/** Text drawn with a bitmap font (load it as an AssetLoader `bmpfont`). `font` is the font's own name. */
export type BitmapTextElement = Base & {
  type: 'bitmapText';
  text?: string;
  bind?: string;
  textKey?: string;
  upper?: boolean;
  anchor?: { x: number; y: number };
  font: string;
  size: number;
  color: ColorRef;
  align?: 'left' | 'center' | 'right';
};

/**
 * A frame animation from a spritesheet: either one `image`, or numbered frames `prefix` + number + `postfix` from `start`
 * to `end` (the legacy getAnimatedSprite fields). `animationSpeed` is Pixi's (frames per tick, default 1).
 */
export type AnimatedSpriteElement = Base & {
  type: 'animatedSprite';
  image?: string;
  prefix?: string;
  postfix?: string;
  start?: number;
  end?: number;
  checkPoint?: 10 | 100;
  toAddZero?: boolean;
  skipFrame?: boolean;
  playReverse?: boolean;
  loop?: boolean;
  animationSpeed?: number;
  playOnStart?: boolean;
  scale?: number;
};

/** An empty labelled container where the scene puts a Spine view: `PixSpine.create` is async, so buildElements cannot. */
export type SpineElement = Base & { type: 'spine'; view: string };

/** `alias` may contain `{key}` tokens filled from the data, for example `{tier}Badge`. */
export type SpriteElement = Base & {
  type: 'sprite';
  alias: string;
  anchor?: { x: number; y: number };
  /** Fit the width to this many pixels (keeps the aspect ratio when only one of width and height is set). */
  width?: number;
  height?: number;
  /** Never scale a sprite above 1 when fitting by `fitWidth`. */
  fitWidth?: number;
};

export type ShapeElement = Base & {
  type: 'shape';
  shape: 'roundRect' | 'rect' | 'circle' | 'arc' | 'polygon' | 'gradientRect';
  /** roundRect and rect: centred on x,y. circle: radius. */
  width?: number;
  height?: number;
  radius?: number;
  /** `{tier}` style tokens are not supported here; use `fillBind` to take a colour from the data. */
  fill?: ColorRef;
  fillBind?: string;
  fillAlpha?: number;
  /** `color` is used unless `colorBind` takes the colour from the data. */
  stroke?: { width: number; color?: ColorRef; colorBind?: string; alpha?: number };
  /** arc: a pie slice of `radius` from `startAngle` to `endAngle` (radians). */
  startAngle?: number;
  endAngle?: number;
  /** polygon: x, y pairs. */
  points?: number[];
  /** gradientRect: `colors` evenly spaced from `gradientStart` to `gradientEnd` (0..1 of the rectangle, default left to right). */
  colors?: number[];
  gradientStart?: { x: number; y: number };
  gradientEnd?: { x: number; y: number };
};

export type GroupElement = Base & {
  type: 'group';
  children: ElementConfig[];
};

export type ElementConfig =
  TextElement | BitmapTextElement | SpriteElement | AnimatedSpriteElement | ShapeElement | SpineElement | GroupElement;

/** One canvas view: the portion it takes, its assets, its elements and its timings. */
export type ViewConfig<T extends Record<string, number> = Record<string, number>> = {
  canvas: CanvasConfig;
  assets: Array<{ alias: string; src: string }>;
  timings: T;
};

/** Thrown for a config that can never work (caught at build and by npm run check, not at the player). */
export class ViewConfigError extends Error {}

/** Checks a canvas portion: finite numbers, a share of 1..100, and min not above max. */
export function validateCanvas(c: CanvasConfig, where = 'canvas'): void {
  const bad = (m: string) => {
    throw new ViewConfigError(`${where}: ${m}`);
  };
  for (const k of ['heightPct', 'minHeight', 'maxHeight'] as const) {
    if (!Number.isFinite(c[k])) bad(`${k} must be a finite number`);
  }
  if (c.heightPct <= 0 || c.heightPct > 100) bad('heightPct must be between 1 and 100');
  if (c.minHeight <= 0) bad('minHeight must be above 0');
  if (c.minHeight > c.maxHeight) bad('minHeight must not exceed maxHeight');
}

/** Checks an element list: unique ids per level, text has text or bind, sprites have an alias, shapes have a size. */
export function validateElements(elements: ElementConfig[], where = 'elements'): void {
  const seen = new Set<string>();
  for (const e of elements) {
    const at = `${where}.${e.id || '(no id)'}`;
    const bad = (m: string) => {
      throw new ViewConfigError(`${at}: ${m}`);
    };
    if (!e.id) bad('id is required');
    if (seen.has(e.id)) bad('duplicate id');
    seen.add(e.id);
    if (!Number.isFinite(e.x) || !Number.isFinite(e.y)) bad('x and y must be finite numbers');
    if (e.type === 'text') {
      if (e.text === undefined && !e.bind && !e.textKey) bad('text needs `text`, `bind` or `textKey`');
      if (e.style.size <= 0) bad('style.size must be above 0');
    } else if (e.type === 'sprite') {
      if (!e.alias) bad('sprite needs an alias');
    } else if (e.type === 'bitmapText') {
      if (e.text === undefined && !e.bind && !e.textKey) bad('bitmapText needs `text`, `bind` or `textKey`');
      if (!e.font) bad('bitmapText needs a font');
      if (!(e.size > 0)) bad('size must be above 0');
    } else if (e.type === 'animatedSprite') {
      if (!e.image && !(e.prefix !== undefined && e.postfix !== undefined && e.start! >= 0 && e.end! >= e.start!))
        bad('animatedSprite needs `image`, or `prefix`, `postfix`, `start` and `end`');
    } else if (e.type === 'spine') {
      if (!e.view) bad('spine needs a view name');
    } else if (e.type === 'shape') {
      if (
        e.shape === 'circle' || e.shape === 'arc'
          ? !(e.radius && e.radius > 0)
          : e.shape === 'polygon'
            ? false
            : !(e.width && e.height)
      )
        bad('shape needs a size');
      if (e.shape === 'arc' && !(Number.isFinite(e.startAngle) && Number.isFinite(e.endAngle)))
        bad('arc needs startAngle and endAngle');
      if (e.shape === 'polygon' && !(e.points && e.points.length >= 6 && e.points.length % 2 === 0))
        bad('polygon needs at least 3 points (x, y pairs)');
      if (e.shape === 'gradientRect' && !(e.colors && e.colors.length >= 2))
        bad('gradientRect needs at least 2 colors');
      if (e.fill === undefined && !e.fillBind && !e.stroke && e.shape !== 'gradientRect')
        bad('shape needs a fill or a stroke');
    } else {
      validateElements(e.children, at);
    }
  }
}

/**
 * One Spine asset: a skeleton file (`.json` or `.skel`) and its atlas (`.atlas`, which names the page images).
 * `src` values are relative to the assets root, like StageAsset. Loaded and shared through core/pixi/wrapper/SpineAssets.
 */
export type SpineAssetDef = { id: string; skeleton: string; atlas: string };

/** How a Spine view is placed: `fit` scales the skeleton bounds into a box (exports are often far larger than the canvas). */
export type SpinePlaceConfig = {
  x?: number;
  y?: number;
  scale?: number;
  pivot?: { x: number; y: number };
  flipX?: boolean;
  flipY?: boolean;
  fit?: { width: number; height: number; mode: 'contain' | 'cover' | 'none' };
};

/** One Spine view of an asset: what to show first, mixing between animations, and where it sits. */
export type SpineViewConfig = {
  /** `id` of a SpineAssetDef. */
  asset: string;
  defaultState?: string;
  /** Loop `defaultState` (the old `loop` field). Default false. */
  loop?: boolean;
  skin?: string | string[];
  /** Seconds of blending between two animations when no pair in `mixes` applies. Default 0 (hard cut). */
  defaultMix?: number;
  mixes?: Array<{ from: string; to: string; duration: number }>;
  place?: SpinePlaceConfig;
  /** The size getWidth and getHeight report for layout (the legacy `boundingBox`); default: the drawn size. */
  boundingBox?: { width: number; height: number };
};

/** Checks Spine assets: unique ids, a skeleton file (.json or .skel) and an .atlas file. */
export function validateSpineAssets(defs: SpineAssetDef[], where = 'spine'): void {
  const seen = new Set<string>();
  for (const d of defs) {
    const bad = (m: string) => {
      throw new ViewConfigError(`${where}.${d.id || '(no id)'}: ${m}`);
    };
    if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(d.id ?? ''))
      bad('id must start with a letter and use letters, digits, - or _');
    if (seen.has(d.id)) bad('duplicate id');
    seen.add(d.id);
    if (!/\.(json|skel)$/i.test(d.skeleton ?? '')) bad('skeleton must be a .json or .skel file');
    if (!/\.atlas$/i.test(d.atlas ?? '')) bad('atlas must be an .atlas file');
  }
}

/** Checks Spine views: each names a known asset, and mix durations and placement numbers are sensible. */
export function validateSpineViews(
  views: Record<string, SpineViewConfig>,
  defs: SpineAssetDef[],
  where = 'spineViews',
): void {
  const ids = new Set(defs.map((d) => d.id));
  const finite = (n: unknown) => typeof n === 'number' && Number.isFinite(n);
  for (const [name, v] of Object.entries(views)) {
    const bad = (m: string) => {
      throw new ViewConfigError(`${where}.${name}: ${m}`);
    };
    if (!ids.has(v.asset)) bad(`asset "${v.asset}" is not a declared Spine asset`);
    if (v.defaultMix !== undefined && !(finite(v.defaultMix) && v.defaultMix >= 0))
      bad('defaultMix must be a number of seconds, 0 or more');
    for (const m of v.mixes ?? []) {
      if (!m.from || !m.to) bad('a mix needs `from` and `to` animation names');
      if (!(finite(m.duration) && m.duration >= 0)) bad(`mix ${m.from} -> ${m.to}: duration must be 0 or more`);
    }
    const p = v.place;
    if (p) {
      for (const k of ['x', 'y', 'scale'] as const)
        if (p[k] !== undefined && !finite(p[k])) bad(`place.${k} must be a finite number`);
      if (p.scale !== undefined && p.scale <= 0) bad('place.scale must be above 0');
      if (p.pivot && !(finite(p.pivot.x) && finite(p.pivot.y))) bad('place.pivot needs finite x and y');
      if (p.fit && !(p.fit.width > 0 && p.fit.height > 0)) bad('place.fit needs a width and height above 0');
      if (p.fit && !['contain', 'cover', 'none'].includes(p.fit.mode))
        bad('place.fit.mode must be contain, cover or none');
    }
    if (typeof v.skin === 'string' ? !v.skin : v.skin?.some((s) => !s)) bad('skin names must not be empty');
  }
}

/**
 * One thing a canvas loads. `image` and `atlas` (a spritesheet .json) are loaded by Pixi from the extension. The others are
 * the legacy framework's asset types: `sequence` is several spritesheets (`src` holds `{n}`, replaced by 0, 1, ...; the aliases
 * are `<alias>0`, `<alias>1`, ...), `font` is a canvas-only font file (page text uses CSS fonts) and `bmpfont` is a bitmap font.
 * `src` is relative to the assets root and may hold `{res}` (`@1x` or `@0.5x`, from DeviceConfigProxy). A plain
 * `{ alias, src }` (the old StageAsset) is an image or atlas.
 */
export type AssetDef =
  | { kind?: 'image' | 'atlas'; alias: string; src: string }
  | { kind: 'sequence'; alias: string; src: string; sheets: number | { '@1x': number; '@0.5x': number } }
  | { kind: 'font'; alias: string; family: string; src: string }
  | { kind: 'bmpfont'; alias: string; src: string };

/** A named group of assets a scene loads and releases together (the legacy primary and secondary bundles). */
export type AssetBundleDef = { id: string; assets: AssetDef[] };

const ASSET_KINDS = ['image', 'atlas', 'sequence', 'font', 'bmpfont'];

/** Checks assets: unique aliases, a source, and what each kind needs. */
export function validateAssets(defs: AssetDef[], where = 'assets'): void {
  const seen = new Set<string>();
  for (const d of defs) {
    const bad = (m: string) => {
      throw new ViewConfigError(`${where}.${d.alias || '(no alias)'}: ${m}`);
    };
    if (!d.alias) bad('alias is required');
    if (seen.has(d.alias)) bad('duplicate alias');
    seen.add(d.alias);
    if (!d.src) bad('src is required');
    if (d.kind && !ASSET_KINDS.includes(d.kind)) bad(`unknown kind "${String(d.kind)}"`);
    if (d.kind === 'sequence') {
      const n = typeof d.sheets === 'number' ? [d.sheets] : [d.sheets?.['@1x'], d.sheets?.['@0.5x']];
      if (!n.every((x) => Number.isInteger(x) && (x as number) > 0)) bad('sheets must be whole numbers above 0');
      if (!d.src.includes('{n}')) bad('a sequence src needs {n}');
    }
    if (d.kind === 'font' && !d.family) bad('a font needs a family name');
  }
}

/** Checks bundles: unique ids, each a valid asset list, and no alias in two bundles with different files. */
export function validateBundles(bundles: AssetBundleDef[], where = 'bundles'): void {
  const ids = new Set<string>();
  const files = new Map<string, string>();
  for (const b of bundles) {
    if (!b.id) throw new ViewConfigError(`${where}: a bundle needs an id`);
    if (ids.has(b.id)) throw new ViewConfigError(`${where}.${b.id}: duplicate bundle id`);
    ids.add(b.id);
    validateAssets(b.assets, `${where}.${b.id}`);
    for (const a of b.assets) {
      const seen = files.get(a.alias);
      if (seen !== undefined && seen !== a.src)
        throw new ViewConfigError(`${where}.${b.id}.${a.alias}: alias is also used with another file (${seen})`);
      files.set(a.alias, a.src);
    }
  }
}

/** Checks the `interactive` blocks of an element list (nested groups included): a unique event name and sensible numbers. */
export function validateInteractions(elements: ElementConfig[], where = 'elements'): void {
  const seen = new Set<string>();
  const walk = (list: ElementConfig[], at: string) => {
    for (const e of list) {
      const here = `${at}.${e.id}`;
      const i = e.interactive;
      if (i) {
        const bad = (m: string) => {
          throw new ViewConfigError(`${here}.interactive: ${m}`);
        };
        if (!i.event) bad('event is required');
        if (seen.has(i.event)) bad(`duplicate event "${i.event}"`);
        seen.add(i.event);
        for (const k of ['hitPadding', 'minTarget'] as const)
          if (i[k] !== undefined && !(Number.isFinite(i[k]) && (i[k] as number) >= 0)) bad(`${k} must be 0 or more`);
        if (i.disabledAlpha !== undefined && !(i.disabledAlpha >= 0 && i.disabledAlpha <= 1))
          bad('disabledAlpha must be between 0 and 1');
      }
      if (e.type === 'group') walk(e.children, here);
    }
  };
  walk(elements, where);
}
