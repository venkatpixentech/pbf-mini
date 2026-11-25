// Config for the Acca Crash curve canvas. Edit this file to change how much of the screen the canvas takes,
// the colours, line widths, grid levels and the text labels. CrashCurveScene only draws the live curve
// and places these elements.
import type { ElementConfig } from 'core/pixi/viewConfig';

import type { AccaKey } from '../i18n';

export const crashCurveConfig = {
  /** Canvas portion: a share of the screen height, kept between min and max (px). */
  canvas: { heightPct: 30, minHeight: 200, maxHeight: 280 },
  assets: [] as Array<{ alias: string; src: string }>,
  /** Curve drawing: padding around the plot, grid lines, curve and head dot. */
  plot: {
    pad: 24,
    /** x axis shows at least this many ms, y axis at least this multiplier. */
    minTimeMs: 10000,
    minMultiplier: 2,
    headroom: 1.15,
    gridLevels: [1, 1.5, 2, 3, 5, 10, 20, 50],
    gridWidth: 1,
    gridColor: 'white' as const,
    gridAlpha: 0.08,
    curveWidth: 4,
    areaAlpha: 0.14,
    headRadius: 6,
    headGlowRadius: 11,
    headGlowAlpha: 0.25,
  },
  /** Colours by state. */
  colors: { live: 'green' as const, crashed: 'red' as const, subLive: 'muted' as const, subCrashed: 'red' as const },
  /** The head dot breathes while the run is live. */
  pulse: { periodMs: 220, amount: 0.35 },
  /** Translation keys of the text shown while running or crashed (the English text is in i18n/en.ts). */
  texts: {
    live: 'acca.curve.live',
    crashed: 'acca.curve.crashed',
    boost: 'acca.curve.boost',
  } satisfies Record<string, AccaKey>,
  /** Labels, built from config. Ids `label`, `sub` and `boost` are updated by the scene. */
  elements: [
    {
      type: 'text',
      id: 'label',
      text: '',
      x: 16,
      y: 10,
      anchor: { x: 0, y: 0 },
      style: { font: 'display', size: 60, weight: '900', color: 'green' },
    },
    {
      type: 'text',
      id: 'sub',
      text: '',
      x: 18,
      y: 74,
      anchor: { x: 0, y: 0 },
      style: { font: 'body', size: 12, weight: '800', color: 'white', letterSpacing: 1 },
    },
    {
      type: 'text',
      id: 'boost',
      text: '',
      // x is measured from the right edge of the canvas
      x: -14,
      y: 12,
      anchor: { x: 1, y: 0 },
      style: { font: 'display', size: 18, weight: '900', color: 'green', align: 'right' },
    },
  ] as ElementConfig[],
};
