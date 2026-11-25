// Card tier colours for the Higher or Lower card face (face and rim). Game-owned: the core theme only holds the
// shared PBF palette.
export type Tier = 'gold' | 'silver' | 'bronze';

export const TIER_COLORS: Record<Tier, { face: number; rim: number }> = {
  gold: { face: 0xe2b552, rim: 0xf8e2a0 },
  silver: { face: 0xc9ced6, rim: 0xffffff },
  bronze: { face: 0xd49770, rim: 0xf6cfae },
};
