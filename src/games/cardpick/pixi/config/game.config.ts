// Pixi config for Card Pick: what the first screen preloads, the design size the scene lays out in, and the scene's elements
// (three face-down cards, each tappable). The scene (pixi/view/CardPickScene.ts) only builds these and reacts to its props.
// The badge art is PBF's progress badges atlas (the same 28 KB file Higher or Lower uses).
import type { PixiGameConfig } from 'core/pixi/GameConfigProxy';
import type { CanvasConfig, ElementConfig } from 'core/pixi/viewConfig';

import { CARD_COUNT } from '../../api/types.ts';

const badges = { alias: 'cpBadges', src: 'cardpick/images/badges.json' };

export const cardpickPixiConfig = {
  preload: [badges],
  assets: [badges],
  design: { width: 720, height: 360, fit: 'contain' },
} satisfies PixiGameConfig;

/** How much of the screen the canvas takes (a share of its height, kept between a minimum and a maximum, in px). */
export const cardpickCanvas: CanvasConfig = { heightPct: 34, minHeight: 200, maxHeight: 300 };

/** Card size and where each card sits in the 720 x 360 design. */
export const CARD = { width: 180, height: 250, radius: 18, y: 180, xs: [120, 360, 600] };

/** The target (and event) name of card `i`: the scene reports a tap on it, React turns it into a pick. */
export const cardTarget = (i: number) => `card-${i}`;
export const cardIndex = (target: string) => (/^card-(\d+)$/.test(target) ? Number(target.slice(5)) : -1);

/** Colours: a face-down card, the winning card, a losing card. */
export const COLORS = { back: 0x35507a, win: 0x3bbf6a, lose: 0x6b7280, pickedRim: 0xffd54a };

/** Three face-down cards with a question mark each. Every card is a tap target; `minTarget` is left at its default. */
export const cardpickElements: ElementConfig[] = Array.from({ length: CARD_COUNT }, (_, i) => [
  {
    type: 'shape' as const,
    id: cardTarget(i),
    x: CARD.xs[i],
    y: CARD.y,
    shape: 'roundRect' as const,
    width: CARD.width,
    height: CARD.height,
    radius: CARD.radius,
    fill: COLORS.back,
    stroke: { width: 5, color: 'white' as const },
    interactive: { event: cardTarget(i) },
  },
  {
    type: 'text' as const,
    id: `mark-${i}`,
    x: CARD.xs[i],
    y: CARD.y,
    text: '?',
    style: { font: 'display' as const, size: 96, weight: '900' as const, color: 'white' as const },
  },
]).flat();

/** The badge shown on a revealed card: gold for the winner, bronze for the others. */
export const badgeAlias = (winning: boolean) => (winning ? 'goldBadge' : 'bronzeBadge');
