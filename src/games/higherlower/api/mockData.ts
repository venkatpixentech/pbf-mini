// MOCK DATA: synthetic player pool for the mock backend. Not real PBF player data.
import { NATIONS, type Nation } from '../pixi/config/cardReveal.config.ts';
import type { Card } from '../pixi/view/CardRevealScene.ts';

const FIRST = ['Leo', 'Mason', 'Kai', 'Theo', 'Noah', 'Rafa', 'Jude', 'Luca', 'Omar', 'Ezra', 'Milo', 'Ivan'];
const LAST = ['Carter', 'Silva', 'Novak', 'Reyes', 'Okafor', 'Berg', 'Moreau', 'Kane', 'Duarte', 'Lindqvist', 'Haddad'];
const CLUBS = ['North FC', 'River City', 'Harbour Utd', 'Vale Athletic', 'Southport', 'Castleview'];
// Positions reused from PBF's own formation model (formationConfig.ts).
const POSITIONS = ['GK', 'LB', 'CB', 'RB', 'LM', 'CM', 'CAM', 'CDM', 'RM', 'ST', 'LW', 'RW'];

export const tierFor = (ovr: number): Card['tier'] => (ovr >= 85 ? 'gold' : ovr >= 78 ? 'silver' : 'bronze');

/** Deterministic per-stat spread around the card's OVR, so ATT/CRE/DEF vary but stay plausible. */
function statsFor(i: number, ovr: number): { attack: number; creativity: number; defence: number } {
  const wobble = (seed: number) => Math.max(40, Math.min(99, ovr + (((i * seed) % 13) - 6)));
  return { attack: wobble(11), creativity: wobble(17), defence: wobble(23) };
}

/** 3 players per OVR value from 71 to 91 (63 cards), so every OVR is equally likely as the next draw. */
export const MOCK_PLAYERS: Card[] = Array.from({ length: 21 * 3 }, (_, i) => {
  const ovr = 71 + Math.floor(i / 3);
  const name = `${FIRST[i % FIRST.length]} ${LAST[(i * 7) % LAST.length]}`;
  const nation: Nation = NATIONS[i % (NATIONS.length - 1)]; // skip "Random" for the mock pool
  return {
    name,
    club: CLUBS[(i * 5) % CLUBS.length],
    position: POSITIONS[(i * 3) % POSITIONS.length],
    nation,
    ovr,
    ...statsFor(i, ovr),
    tier: tierFor(ovr),
  };
});
