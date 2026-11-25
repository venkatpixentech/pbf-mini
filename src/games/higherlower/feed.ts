// Cosmetic "other players" feed, after the prototype's live feed + bots. Purely client-side and
// decorative: it never touches balance, odds or outcomes, which stay entirely server-owned.
import type { Card, MarketId } from './api/types';

const BOTS = ['SarahM', 'Dave82', 'MancBlue', 'Kasia_', 'TomR', 'Yuki99', 'ProBet_Al', 'Nina.K'];
const MARKET_LABEL: Record<MarketId, string> = {
  H1: 'Higher',
  H2: 'Higher 2+',
  H3: 'Higher 3+',
  L1: 'Lower',
  L2: 'Lower 2+',
  L3: 'Lower 3+',
};

export type FeedEvent = { id: number; name: string; text: string; win: boolean };

let seq = 0;

/** One simulated line for the current card, biased toward the markets that are actually open. */
export function nextFeedEvent(current: Card, openMarkets: MarketId[], random: () => number = Math.random): FeedEvent {
  const name = BOTS[Math.floor(random() * BOTS.length)];
  const market = openMarkets.length ? openMarkets[Math.floor(random() * openMarkets.length)] : 'H1';
  const win = random() < 0.52;
  const text = win
    ? `cashed out on ${MARKET_LABEL[market]} at ${current.ovr}`
    : `backed ${MARKET_LABEL[market]} at ${current.ovr}, lost the streak`;
  return { id: ++seq, name, text, win };
}
