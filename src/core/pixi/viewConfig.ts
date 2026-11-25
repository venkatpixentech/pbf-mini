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
};

type Base = {
  /** Name used to find the built object (`getChildByLabel`) and to bind data. */
  id: string;
  x: number;
  y: number;
  alpha?: number;
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
};

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
  shape: 'roundRect' | 'rect' | 'circle';
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
};

export type GroupElement = Base & {
  type: 'group';
  children: ElementConfig[];
};

export type ElementConfig = TextElement | SpriteElement | ShapeElement | GroupElement;

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
    } else if (e.type === 'shape') {
      if (e.shape === 'circle' ? !(e.radius && e.radius > 0) : !(e.width && e.height)) bad('shape needs a size');
      if (e.fill === undefined && !e.fillBind && !e.stroke) bad('shape needs a fill or a stroke');
    } else {
      validateElements(e.children, at);
    }
  }
}
