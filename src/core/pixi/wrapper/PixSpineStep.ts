// The numbers behind PixSpine: fit-to-box placement, the start time of an animation, and the error text for a
// missing animation. Plain TypeScript with no Pixi or Spine import, so `PixSpine.check.ts` can run it in Node.
// The drawing and playback are in PixSpine.ts.
import { fitScale } from '../layout.ts';
import type { SpinePlaceConfig } from '../viewConfig';

export type Box = { x: number; y: number; width: number; height: number };
export type SpineFit = NonNullable<SpinePlaceConfig['fit']>;

/**
 * Scale and pivot that put `bounds` (the skeleton's bounds in its own coordinates) inside the fit box.
 * `contain` shows everything, `cover` fills the box, `none` keeps the scale. The pivot is the centre of the bounds, so
 * the position given to the PixSpine is the centre of the fitted box. Empty bounds keep scale 1 and the origin.
 */
export function fitPlacement(bounds: Box, fit: SpineFit): { scale: number; pivot: { x: number; y: number } } {
  if (!(bounds.width > 0 && bounds.height > 0)) return { scale: 1, pivot: { x: 0, y: 0 } };
  const scale = fitScale(bounds, fit, fit.mode);
  return { scale, pivot: { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 } };
}

/**
 * Track time (seconds, along the playback direction) to start an animation at, or undefined to start normally.
 * 'first' is the start of the animation window, 'last' its end, a number is clamped into the window.
 */
export function resolveStartTime(
  startAt: 'first' | 'last' | number | undefined,
  animationStart: number,
  animationEnd: number,
): number | undefined {
  if (startAt === undefined) return undefined;
  if (startAt === 'first') return animationStart;
  if (startAt === 'last') return animationEnd;
  if (!Number.isFinite(startAt)) return undefined;
  return Math.min(animationEnd, Math.max(animationStart, startAt));
}

export const missingAnimationMessage = (name: string, names: string[]) =>
  `Spine animation "${name}" not found; the skeleton has: ${names.join(', ') || '(none)'}`;

export const missingSkinMessage = (name: string, names: string[]) =>
  `Spine skin "${name}" not found; the skeleton has: ${names.join(', ') || '(none)'}`;

/** The legacy alias names of a Spine asset: asset `effects` is loaded under `effectsData` and `effectsAtlas`. */
export const spineAliases = (id: string) => ({ skeleton: `${id}Data`, atlas: `${id}Atlas` });
