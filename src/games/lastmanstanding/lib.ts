// Pure helpers shared by the Last Man Standing screens. Display only: the server owns every result.
import { formatMoney } from 'core/services/money';

import type { Fixture, Game, Team } from './api/types';

export const tier = (t: Team): 'gold' | 'silver' | 'bronze' =>
  t.ovr >= 80 ? 'gold' : t.ovr >= 70 ? 'silver' : 'bronze';

/** Planner colour for a win chance: easy, fair, tough, very tough. */
export const quality = (p: number): 'q1' | 'q2' | 'q3' | 'q4' =>
  p >= 0.6 ? 'q1' : p >= 0.45 ? 'q2' : p >= 0.3 ? 'q3' : 'q4';
export const qualityWord = (p: number) => (p >= 0.6 ? 'easy' : p >= 0.45 ? 'fair' : p >= 0.3 ? 'tough' : 'very tough');

export const teamMap = (game: Game) => new Map(game.teams.map((t) => [t.code, t]));

export type Slot = { fixture: Fixture; home: boolean; opp: string; winChance: number };

/** A team's fixture in a game week, seen from that team. */
export function slotOf(game: Game, gw: number, code: string): Slot {
  const fixture = game.schedule[gw].find((f) => f.home === code || f.away === code)!;
  const home = fixture.home === code;
  return {
    fixture,
    home,
    opp: home ? fixture.away : fixture.home,
    winChance: home ? fixture.probs[0] : fixture.probs[2],
  };
}

export function favouriteLabel(f: Fixture, names: Map<string, Team>): string {
  const [h, , a] = f.probs;
  const H = names.get(f.home)!.name;
  const A = names.get(f.away)!.name;
  if (h - a > 0.35) return `${H} strong favourites`;
  if (h - a > 0.12) return `${H} favourites`;
  if (a - h > 0.35) return `${A} strong favourites`;
  if (a - h > 0.12) return `${A} favourites`;
  return 'Evenly matched';
}

/** Prize for having won `wins` rounds. */
export const prizeFor = (game: Game, wins: number) => (wins <= 0 ? 0 : game.stake * game.ladder[wins - 1]);

/** Money without trailing .00 for chips and ladder rungs. */
export const short = (value: number, currency: string) => formatMoney(value, currency).replace(/\.00$/, '');

export type BallPath = { x: number[]; y: number[] };

/** Cosmetic ball path, one point per minute: attacks build towards the real goals and chances. Home attacks right. */
export function ballPath(
  events: Array<{ m: number; s: 'h' | 'a'; goal: boolean }>,
  bias: number,
  random: () => number = Math.random,
): BallPath {
  const sorted = [...events].sort((a, b) => a.m - b.m);
  const X = [50];
  const Y = [50];
  let x = 50;
  let y = 50;
  for (let t = 1; t <= 91; t++) {
    const e = sorted.find((ev) => t >= ev.m - 3 && t <= ev.m);
    const afterGoal = sorted.find((ev) => ev.goal && t === ev.m + 1);
    if (afterGoal) {
      x = 50;
      y = 50;
    } else if (e) {
      const goalX = e.s === 'h' ? (e.goal ? 99 : 93) : e.goal ? 1 : 7;
      const k = (t - (e.m - 3)) / 3;
      x = x + (goalX - x) * Math.min(1, 0.35 + k * 0.65);
      y = y + ((e.goal ? 50 : 38 + random() * 24) - y) * 0.6;
    } else {
      x = Math.max(14, Math.min(86, x + (random() - 0.5) * 26 + bias + (50 - x) * 0.12));
      y = Math.max(12, Math.min(88, y + (random() - 0.5) * 34));
    }
    X.push(x);
    Y.push(y);
  }
  return { x: X, y: Y };
}
