// Shared canvas theme: the PBF tokens from src/styles.css as Pixi numbers, so no scene hard-codes a colour or font.
// Change a token here and every scene and config that references it follows.
export const COLORS = {
  ink: 0x1d1030, // --pbf-primary-700
  white: 0xffffff,
  green: 0x00e9a3, // --action-primary
  red: 0xff2072, // --status-live
  gold: 0xffd24a,
  muted: 0xa59fbf,
  cardHi: 0x4a4059, // --surface-card-hi
  cardRim: 0x80758f,
} as const;

export const FONTS = {
  display: 'Degular, Figtree, system-ui, sans-serif',
  body: '"Avenir Next", Mulish, system-ui, sans-serif',
} as const;

export type ColorName = keyof typeof COLORS;
export type FontName = keyof typeof FONTS;
