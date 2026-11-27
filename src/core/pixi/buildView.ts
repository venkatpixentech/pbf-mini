// Turns a config element list into Pixi display objects. Views call this instead of hand-building every
// Text, Sprite and Graphics, so layout and styling stay in the config file.
import { BitmapText, Container, Graphics, Sprite, Text, Texture } from 'pixi.js';

import { translate } from 'core/i18n';
import { warnOnce as warn } from 'core/utils/LoggerService';

import { COLORS, FONTS } from './theme';
import { UIUtil } from './UIUtilService';
import {
  type BitmapTextElement,
  type ColorRef,
  type ElementConfig,
  type ShapeElement,
  type TextStyleConfig,
  validateElements,
} from './viewConfig';

export type ViewData = Record<string, string | number>;

export const colorOf = (c: ColorRef): number => (typeof c === 'number' ? c : COLORS[c]);

const warnOnce = (message: string) => warn('view', message);

/** Texture for an alias; a missing asset shows nothing and warns once instead of throwing mid-game (UIUtil.getTexture). */
const textureOf = (alias: string): Texture => UIUtil.getTexture(alias);

/** A bound value; warns once when the data does not have the key. */
function bound(data: ViewData, key: string): string | number {
  if (!(key in data)) warnOnce(`bind "${key}" has no value in the data`);
  return data[key] ?? '';
}

// translated texts and what they were built from, so a language switch can relabel them in place
type Fit = { baseSize: number; maxWidth?: number; maxLines?: number };
const translated = new WeakMap<Text | BitmapText, { key: string; data: ViewData; upper: boolean; fit?: Fit }>();

const translateText = (key: string, data: ViewData, upper: boolean) => {
  const value = translate(fill(key, data), data);
  return upper ? value.toUpperCase() : value;
};

/** Re-translates every `textKey` text under `root` (called when the language changes). */
export function relabelTexts(root: Container) {
  for (const child of root.children) {
    if (child instanceof Text || child instanceof BitmapText) {
      const source = translated.get(child);
      if (source) {
        child.text = translateText(source.key, source.data, source.upper);
        if (source.fit && child instanceof Text) UIUtil.fitText(child, source.fit); // a longer word may not fit any more
      }
    }
    if (child instanceof Container) relabelTexts(child);
  }
}

// each config array is validated once, not on every card or label build
const validated = new WeakSet<ElementConfig[]>();

const fill = (template: string, data: ViewData) =>
  template.replace(/\{(\w+)\}/g, (_, key: string) => String(data[key] ?? ''));

export function textStyle(s: TextStyleConfig) {
  return {
    fill: colorOf(s.color),
    fontSize: s.size,
    fontWeight: s.weight ?? '700',
    fontFamily: FONTS[s.font],
    letterSpacing: s.letterSpacing ?? 0,
    align: s.align ?? 'left',
    ...(s.wordWrapWidth ? { wordWrap: true, wordWrapWidth: s.wordWrapWidth } : {}),
  } as const;
}

function shape(c: ShapeElement, data: ViewData): Graphics {
  const g = new Graphics();
  if (c.shape === 'circle') g.circle(0, 0, c.radius ?? 10);
  else if (c.shape === 'arc')
    g.moveTo(0, 0)
      .arc(0, 0, c.radius ?? 10, c.startAngle ?? 0, c.endAngle ?? Math.PI)
      .lineTo(0, 0);
  else if (c.shape === 'polygon') g.poly(c.points ?? []);
  else if (c.shape === 'gradientRect') {
    const gradient = UIUtil.getGradientRectangle({
      width: c.width ?? 0,
      height: c.height ?? 0,
      colors: c.colors,
      start: c.gradientStart,
      end: c.gradientEnd,
      radius: c.radius,
    });
    gradient.position.set(-(c.width ?? 0) / 2, -(c.height ?? 0) / 2);
    return gradient;
  } else if (c.shape === 'rect') g.rect(-(c.width ?? 0) / 2, -(c.height ?? 0) / 2, c.width ?? 0, c.height ?? 0);
  else g.roundRect(-(c.width ?? 0) / 2, -(c.height ?? 0) / 2, c.width ?? 0, c.height ?? 0, c.radius ?? 0);
  const fillColor = c.fillBind ? Number(bound(data, c.fillBind)) : c.fill !== undefined ? colorOf(c.fill) : undefined;
  if (fillColor !== undefined) g.fill({ color: fillColor, alpha: c.fillAlpha ?? 1 });
  if (c.stroke) {
    const color = c.stroke.colorBind ? Number(bound(data, c.stroke.colorBind)) : colorOf(c.stroke.color ?? 'white');
    g.stroke({ width: c.stroke.width, color, alpha: c.stroke.alpha ?? 1 });
  }
  return g;
}

function bitmapText(c: BitmapTextElement, data: ViewData): BitmapText {
  const value = c.textKey
    ? translateText(c.textKey, data, !!c.upper)
    : c.bind
      ? String(bound(data, c.bind))
      : (c.text ?? '');
  const t = new BitmapText({
    text: c.upper && !c.textKey ? value.toUpperCase() : value,
    style: { fontFamily: c.font, fontSize: c.size, fill: colorOf(c.color), align: c.align ?? 'left' },
  });
  if (c.textKey) translated.set(t, { key: c.textKey, data, upper: !!c.upper });
  t.anchor.set(c.anchor?.x ?? 0.5, c.anchor?.y ?? 0.5);
  return t;
}

/** Builds every element of the list into one container; each child is labelled with its config `id`. */
export function buildElements(elements: ElementConfig[], data: ViewData = {}): Container {
  if (!validated.has(elements)) {
    validateElements(elements);
    validated.add(elements);
  }
  const root = new Container();
  for (const c of elements) {
    let node: Container;
    if (c.type === 'text') {
      const value = c.textKey
        ? translateText(c.textKey, data, !!c.upper)
        : c.bind
          ? String(bound(data, c.bind))
          : (c.text ?? '');
      const t = new Text({ text: c.upper && !c.textKey ? value.toUpperCase() : value, style: textStyle(c.style) });
      t.anchor.set(c.anchor?.x ?? 0.5, c.anchor?.y ?? 0.5);
      const fit: Fit | undefined =
        c.maxWidth !== undefined || c.maxLines !== undefined
          ? { baseSize: c.style.size, maxWidth: c.maxWidth, maxLines: c.maxLines }
          : undefined;
      if (fit) UIUtil.fitText(t, fit);
      if (c.textKey) translated.set(t, { key: c.textKey, data, upper: !!c.upper, fit });
      node = t;
    } else if (c.type === 'bitmapText') {
      node = bitmapText(c, data);
    } else if (c.type === 'animatedSprite') {
      node = UIUtil.getAnimatedSprite(c, c);
    } else if (c.type === 'spine') {
      node = new Container(); // the scene fills it with PixSpine.create(ctx, spineViews[c.view])
    } else if (c.type === 'sprite') {
      const s = new Sprite(textureOf(fill(c.alias, data)));
      s.anchor.set(c.anchor?.x ?? 0.5, c.anchor?.y ?? 0.5);
      if (c.fitWidth !== undefined) s.scale.set(Math.min(1, c.fitWidth / Math.max(s.width, 1)));
      if (c.width !== undefined) s.width = c.width;
      if (c.height !== undefined) s.height = c.height;
      node = s;
    } else if (c.type === 'shape') {
      node = shape(c, data);
    } else {
      node = buildElements(c.children, data);
    }
    node.label = c.id;
    node.position.set(c.x, c.y);
    if (c.alpha !== undefined) node.alpha = c.alpha;
    root.addChild(node);
  }
  return root;
}
