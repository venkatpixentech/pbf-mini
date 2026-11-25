// Cosmetic "other players" community panel, after the prototype's ALL BETS / PREVIOUS / TOP tabs and
// simulated crowd. Purely client-side and decorative: it never touches the real player's balance,
// bets or payouts, which stay entirely server-owned via AccaCrashApi.
import { CROWD_INITIALS } from './api/mockData';

export type CrowdBet = {
  id: string;
  name: string;
  stake: number;
  cashedAt: number | null;
  lost: boolean;
  payout: number;
};

const STAKE_OPTIONS = [10, 20, 50, 100, 200];

/** A masked player name in the prototype's "C***3" style. */
function maskedName(random: () => number): string {
  const initial = CROWD_INITIALS[Math.floor(random() * CROWD_INITIALS.length)];
  const digit = Math.floor(random() * 10);
  return `${initial}***${digit}`;
}

/**
 * One simulated crowd for a round: each bot has a personal cash-out target drawn from a realistic
 * distribution (most cash out early, a few hold for a big multiplier). Call `settle` every tick with
 * the current multiplier (and whether the round has crashed) to get each bot's live status.
 */
export function generateCrowd(
  count: number,
  random: () => number,
): Array<{ name: string; stake: number; target: number }> {
  return Array.from({ length: count }, () => ({
    name: maskedName(random),
    stake: STAKE_OPTIONS[Math.floor(random() * STAKE_OPTIONS.length)],
    // weighted toward lower multipliers, same shape as the real crash curve's own odds
    target: Math.round((1.1 + -Math.log(1 - random() * 0.97) / 1.1) * 100) / 100,
  }));
}

export function settleCrowd(
  crowd: Array<{ name: string; stake: number; target: number }>,
  multiplier: number,
  crashed: boolean,
): CrowdBet[] {
  return crowd.map((b, i) => {
    const cashedAt = multiplier >= b.target ? b.target : null;
    const lost = crashed && cashedAt === null;
    return {
      id: `${i}`,
      name: b.name,
      stake: b.stake,
      cashedAt,
      lost,
      payout: cashedAt ? Math.round(b.stake * cashedAt * 100) / 100 : 0,
    };
  });
}
