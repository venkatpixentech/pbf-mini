// MOCK DATA: synthetic clubs and scorers for the mock backend. Not real PBF data.
import { NATIONS, type Tier } from './types.ts';

export const MOCK_SCORERS: Array<{ name: string; club: string; nation: (typeof NATIONS)[number]; tier: Tier }> = [
  { name: 'L. Carter', club: 'North FC', nation: 'England', tier: 'gold' },
  { name: 'M. Silva', club: 'North FC', nation: 'Brazil', tier: 'silver' },
  { name: 'K. Novak', club: 'River City', nation: 'Germany', tier: 'gold' },
  { name: 'T. Reyes', club: 'River City', nation: 'Spain', tier: 'bronze' },
  { name: 'N. Okafor', club: 'Harbour Utd', nation: 'France', tier: 'silver' },
  { name: 'R. Berg', club: 'Harbour Utd', nation: 'Germany', tier: 'bronze' },
  { name: 'J. Moreau', club: 'Vale Athletic', nation: 'France', tier: 'gold' },
  { name: 'O. Kane', club: 'Vale Athletic', nation: 'England', tier: 'silver' },
  { name: 'E. Duarte', club: 'Southport', nation: 'Portugal', tier: 'bronze' },
  { name: 'I. Haddad', club: 'Southport', nation: 'Turkey', tier: 'silver' },
];

/** Boost added to the multiplier when a dealt card scores, by rarity. */
export const TIER_BOOST: Record<Tier, number> = { gold: 0.5, silver: 0.25, bronze: 0.1 };

/** First letters of masked crowd names, after the prototype's "C***3" style. */
export const CROWD_INITIALS = ['C', 'H', 'A', 'K', 'N', 'G', 'T', 'R', 'M', 'S', 'D', 'P', 'J', 'F', 'B'];
