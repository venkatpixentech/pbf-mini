// Layout for objects drawn inside a canvas: pure functions of sizes (no Pixi import, no window, no config mutation), so
// they run in Node (layout.check.ts) and a scene feeds them the size from its resize(width, height).
// React lays out the page and the canvas box (CanvasFrame, GameLayout); this only places things inside the canvas.
// It replaces the legacy UIUtil layout engine (alignHorizontal, scaleElement, doFullScreen), which only handled portrait,
// rewrote its own config and relied on a class-name check that minification breaks.
export type Size = { width: number; height: number };
export type Box = { x: number; y: number; width: number; height: number };

/** contain: all of it visible; cover: fills the box; width / height: match one side; none: keep the scale. */
export type Fit = 'contain' | 'cover' | 'width' | 'height' | 'none';

export type Anchor = { x: 'left' | 'center' | 'right'; y: 'top' | 'middle' | 'bottom' };

/** A scale and the position of the scaled thing's top-left corner. */
export type Placement = { scale: number; x: number; y: number };

const positive = (n: number) => Number.isFinite(n) && n > 0;

/** Scale that fits `content` into `box` by `fit`. Empty or invalid sizes give 1, never NaN or Infinity. */
export function fitScale(content: Size, box: Size, fit: Fit): number {
  if (
    fit === 'none' ||
    !positive(content.width) ||
    !positive(content.height) ||
    !positive(box.width) ||
    !positive(box.height)
  )
    return 1;
  const sx = box.width / content.width;
  const sy = box.height / content.height;
  if (fit === 'width') return sx;
  if (fit === 'height') return sy;
  return fit === 'contain' ? Math.min(sx, sy) : Math.max(sx, sy);
}

/**
 * Letterbox a design size into the stage: the design is scaled by `fit` and centred. A scene lays everything out in
 * design pixels (one root container) and applies this on every resize.
 */
export function stageFit(design: Size, size: Size, fit: Fit = 'contain'): Placement {
  const scale = fitScale(design, size, fit);
  const w = positive(size.width) ? size.width : 0;
  const h = positive(size.height) ? size.height : 0;
  return { scale, x: (w - design.width * scale) / 2, y: (h - design.height * scale) / 2 };
}

/** Puts `content` inside `box`: scaled by `fit`, then aligned by `anchor` (default: centred). */
export function placeInBox(
  content: Size,
  box: Box,
  anchor: Anchor = { x: 'center', y: 'middle' },
  fit: Fit = 'none',
): Placement {
  const scale = fitScale(content, box, fit);
  const free = { x: box.width - content.width * scale, y: box.height - content.height * scale };
  const along = (a: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom', room: number) =>
    a === 'left' || a === 'top' ? 0 : a === 'right' || a === 'bottom' ? room : room / 2;
  return { scale, x: box.x + along(anchor.x, free.x), y: box.y + along(anchor.y, free.y) };
}

/** Anything with a scale and a position, a Pixi Container for one. */
export type Placeable = { scale: { set(x: number, y?: number): void }; position: { set(x: number, y?: number): void } };

export function applyPlacement(target: Placeable, p: Placement): void {
  target.scale.set(p.scale);
  target.position.set(p.x, p.y);
}
