// Config for the Higher or Lower card canvas. Edit this file to change how much of the screen the canvas
// takes, where each part of a card sits, its fonts and colours, the reveal timings and the assets.
// CardRevealScene only builds these elements and animates them.
import type { ElementConfig, TextStyleConfig, ViewConfig } from 'core/pixi/viewConfig';

export type Nation = 'Brazil' | 'England' | 'France' | 'Germany' | 'Italy' | 'Portugal' | 'Spain' | 'Turkey' | 'Random';
export const NATIONS: Nation[] = [
  'Brazil',
  'England',
  'France',
  'Germany',
  'Italy',
  'Portugal',
  'Spain',
  'Turkey',
  'Random',
];

const ink = (
  size: number,
  weight: TextStyleConfig['weight'],
  font: TextStyleConfig['font'],
  letterSpacing = 0,
): TextStyleConfig => ({
  font,
  size,
  weight,
  color: 'ink',
  letterSpacing,
});

/** Card size in canvas pixels, centred on its own origin. */
export const CARD = { width: 150, height: 210, radius: 12 };

/** The data a card face binds: ovr, position, name, club, attack, creativity, defence, tier, nation, face, rim. The tier name is the translated `hol.tier.<tier>`. */
const statCell = (id: string, icon: string, bind: string, x: number): ElementConfig => ({
  type: 'group',
  id,
  x,
  y: 0,
  children: [
    { type: 'sprite', id: 'icon', alias: icon, x: -10, y: 0, width: 12, height: 12 },
    { type: 'text', id: 'value', bind, x: 0, y: 0, anchor: { x: 0, y: 0.5 }, style: ink(12, '800', 'body') },
  ],
});

/** Card face, front. Ids `ovr position badge name team stats tier` are animated by the reveal. */
export const FACE: ElementConfig[] = [
  {
    type: 'shape',
    id: 'bg',
    shape: 'roundRect',
    x: 0,
    y: 0,
    width: CARD.width,
    height: CARD.height,
    radius: CARD.radius,
    fillBind: 'face',
    stroke: { width: 3, color: 0, colorBind: 'rim' },
  },
  {
    type: 'shape',
    id: 'divider',
    shape: 'rect',
    x: 0,
    y: 31.5,
    width: 130,
    height: 1,
    fill: 'ink',
    fillAlpha: 0.25,
  },
  { type: 'text', id: 'ovr', bind: 'ovr', x: -63, y: -97, anchor: { x: 0, y: 0 }, style: ink(36, '900', 'display') },
  {
    type: 'text',
    id: 'position',
    bind: 'position',
    x: 63,
    y: -95,
    anchor: { x: 1, y: 0 },
    style: ink(14, '900', 'display'),
  },
  { type: 'sprite', id: 'badge', alias: '{tier}Badge', x: 0, y: -18, fitWidth: 56 },
  { type: 'text', id: 'name', bind: 'name', upper: true, x: 0, y: 38, style: ink(14, '900', 'display', 0.4) },
  {
    type: 'group',
    id: 'team',
    x: 0,
    y: 60,
    children: [
      {
        type: 'sprite',
        id: 'flag',
        alias: 'flag-{nation}',
        x: -34,
        y: 0,
        anchor: { x: 0, y: 0.5 },
        width: 16,
        height: 11,
      },
      { type: 'text', id: 'club', bind: 'club', x: -14, y: 0, anchor: { x: 0, y: 0.5 }, style: ink(11, '700', 'body') },
    ],
  },
  {
    type: 'group',
    id: 'stats',
    x: 0,
    y: 80,
    children: [
      statCell('attack', 'statAttack', 'attack', -42),
      statCell('creativity', 'statCreativity', 'creativity', 0),
      statCell('defence', 'statDefence', 'defence', 42),
    ],
  },
  {
    type: 'text',
    id: 'tier',
    textKey: 'hol.tier.{tier}',
    upper: true,
    x: 0,
    y: 97,
    alpha: 0.7,
    style: ink(10, '800', 'body', 1),
  },
];

/** Card back, shown for the next card until it is revealed. */
export const BACK: ElementConfig[] = [
  {
    type: 'shape',
    id: 'bg',
    shape: 'roundRect',
    x: 0,
    y: 0,
    width: CARD.width,
    height: CARD.height,
    radius: CARD.radius,
    fill: 'cardHi',
    stroke: { width: 3, color: 'cardRim' },
  },
  {
    type: 'text',
    id: 'mark',
    text: '?',
    x: 0,
    y: 0,
    alpha: 0.8,
    style: { font: 'display', size: 72, weight: '900', color: 'white' },
  },
];

/** The VS badge between the two cards. */
export const VS: ElementConfig[] = [
  {
    type: 'shape',
    id: 'bg',
    shape: 'circle',
    x: 0,
    y: 0,
    radius: 20,
    fill: 'ink',
    stroke: { width: 2, color: 'white', alpha: 0.3 },
  },
  {
    type: 'text',
    id: 'label',
    text: 'VS',
    x: 0,
    y: 0,
    style: { font: 'display', size: 14, weight: '900', color: 'white' },
  },
];

export const cardRevealConfig = {
  /** Canvas portion: a share of the screen height, kept between min and max (px). */
  canvas: { heightPct: 32, minHeight: 220, maxHeight: 300 },
  // Badge frames cut losslessly from PBF's progressHub atlas into a game atlas holding only the three tiers
  // (28 KB PNG instead of the 150 KB, 1229x2032 shared atlas); real country flags and stat icons from PBF's
  // shared asset pack.
  assets: [
    { alias: 'hlBadges', src: 'higherlower/images/badges.json' },
    ...NATIONS.map((n) => ({ alias: `flag-${n}`, src: `common/images/countryIcons/${n}Icon.svg` })),
    { alias: 'statAttack', src: 'common/icon/attack.svg' },
    { alias: 'statCreativity', src: 'common/icon/creativity.svg' },
    { alias: 'statDefence', src: 'common/icon/defence.svg' },
  ],
  /** Where the two cards sit: spacing from the centre and how far they may fill the canvas before scaling down. */
  layout: { gap: 0.7, fitWidth: 2.6, fitHeight: 1.2 },
  /** Reveal sequence, in milliseconds from the start: flip, badge, name, position, team, stats, tier, OVR roll. */
  timings: {
    flipMs: 450,
    badgeFrom: 600,
    badgeMs: 400,
    nameFrom: 950,
    nameMs: 300,
    nameRise: 10,
    positionFrom: 1200,
    positionMs: 200,
    teamFrom: 1400,
    teamMs: 250,
    statsFrom: 1650,
    statsMs: 250,
    tierFrom: 1900,
    tierMs: 200,
    rollFrom: 2100,
    rollEnd: 2900,
    rollEveryMs: 60,
    rollMin: 70,
    rollRange: 22,
    popMs: 300,
    revealMs: 3200,
  },
} satisfies Omit<ViewConfig, 'timings'> & { layout: Record<string, number>; timings: Record<string, number> };
