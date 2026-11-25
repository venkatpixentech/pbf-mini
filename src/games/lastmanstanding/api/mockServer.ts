// MOCK BACKEND for Last Man Standing. Stands in for the real server until its contract exists (docs/09-BACKEND-INTEGRATION.md, Q1).
// It owns the fixture list, every match result, the prize ladder and the wallet; the UI only renders replies.
// Maths follow the prototype: results are drawn from an OVR/ATT/DEF/CRE strength model fitted to PBF results,
// the match odds carry no margin and the margin sits in the prize ladder (95% of 1/P(reach round) with best play).
import type { SessionErrorCode } from '../../../core/services/apiError.ts';
import { mockTransport } from '../../../core/services/mockTransport.ts';
import { roundMoney } from '../../../core/services/money.ts';
import { LMS_DATA, type RawTeam } from './mockData.ts';
import type { Chance, Fixture, Game, Goal, LastManStandingApi, MatchResult, ModeInfo, Team } from './types.ts';

export const STAKES = [1, 2, 5, 10];
export const ROUNDS = 20;
const START_BALANCE = 100;
// Outcome curve fitted to Playbook Football match results (prototype constants).
const FIT = { edge: 0.9637811344165913, beta: 0.13929879051624958, c: 0.48495260972039633 };

const MODES: ModeInfo[] = [
  { id: 'easy', name: 'Easy', desc: 'Kinder fixtures early on', top: LMS_DATA.modes.easy.top },
  { id: 'medium', name: 'Medium', desc: 'A mixed start', top: LMS_DATA.modes.medium.top },
  { id: 'hard', name: 'Hard', desc: 'Tight fixtures early on', top: LMS_DATA.modes.hard.top },
];

type Options = {
  startBalance?: number;
  latencyMs?: number;
  random?: () => number;
  currency?: string;
  initError?: SessionErrorCode | null;
};

/** Chances of [home win, draw, away win]. */
export function matchProbs(h: Team, a: Team): [number, number, number] {
  const gap = (h.ovr - a.ovr + 0.25 * (h.att - a.def - (a.att - h.def)) + 0.1 * (h.cre - a.cre)) / 1.6 + FIT.edge;
  const z = FIT.beta * gap;
  const sg = (x: number) => 1 / (1 + Math.exp(-x));
  const win = sg(z - FIT.c);
  const loss = sg(-z - FIT.c);
  return [win, 1 - win - loss, loss];
}

/** Double round robin (circle method), second half reversed and rotated so nobody gets long home/away runs. */
export function buildSchedule(codes: string[]): Array<Array<[string, string]>> {
  const n = codes.length;
  const first: Array<Array<[string, string]>> = [];
  let rot = codes.slice();
  for (let r = 0; r < n - 1; r++) {
    const week: Array<[string, string]> = [];
    for (let i = 0; i < n / 2; i++) {
      let a = rot[i];
      let b = rot[n - 1 - i];
      if (i === 0 ? r % 2 === 1 : i % 2 === 1) [a, b] = [b, a];
      week.push([a, b]);
    }
    first.push(week);
    rot = [rot[0], rot[n - 1], ...rot.slice(1, n - 1)];
  }
  const second = first.map((week) => week.map(([a, b]): [string, string] => [b, a]));
  return first.concat(second.slice(13), second.slice(0, 13));
}

const toTeam = ([code, name, ovr, att, def, cre]: RawTeam): Team => ({ code, name, ovr, att, def, cre });

export function createMockServer({
  startBalance = START_BALANCE,
  latencyMs = 150,
  random = Math.random,
  currency = 'GBP',
  initError = null,
}: Options = {}): LastManStandingApi {
  let balance = startBalance;
  const { reply, fail } = mockTransport(latencyMs);

  type Active = Game & { raw: RawTeam[] };
  let active: Active | null = null;
  let seq = 0;

  const snapshot = (g: Active): Game => ({
    id: g.id,
    league: g.league,
    mode: g.mode,
    stake: g.stake,
    teams: g.teams.map((t) => ({ ...t })),
    schedule: g.schedule.map((w) => w.map((f) => ({ ...f, probs: [...f.probs] as Fixture['probs'] }))),
    ladder: [...g.ladder],
    best: [...g.best],
    gap: [...g.gap],
    gw: g.gw,
    wins: g.wins,
    used: [...g.used],
    history: g.history.map((h) => ({ ...h })),
    over: g.over,
  });

  const weighted = <T>(values: T[], weights: number[]): T => {
    let r = random() * weights.reduce((a, b) => a + b, 0);
    for (let i = 0; i < values.length; i++) {
      r -= weights[i];
      if (r < 0) return values[i];
    }
    return values[0];
  };

  const scorer = (g: Active, code: string): string | null => {
    const sc = g.raw.find((t) => t[0] === code)?.[6] ?? [];
    if (!sc.length || (sc.length < 3 && random() < 0.5)) return null;
    return weighted(
      sc.map((x) => x[0]),
      sc.map((x) => x[1]),
    );
  };

  function playMatch(g: Active, f: Fixture): MatchResult {
    const [pw, pd] = f.probs;
    const r = random();
    const outcome = r < pw ? 'H' : r < pw + pd ? 'D' : 'A';
    let hs: number;
    let as: number;
    if (outcome === 'D') {
      hs = as = weighted([0, 1, 2, 3], [30, 42, 22, 6]);
    } else {
      const loser = weighted([0, 1, 2], [50, 35, 15]);
      const winner = loser + weighted([1, 2, 3, 4], [50, 30, 14, 6]);
      [hs, as] = outcome === 'H' ? [winner, loser] : [loser, winner];
    }
    const sides: Array<'h' | 'a'> = [];
    for (let i = 0; i < hs; i++) sides.push('h');
    for (let i = 0; i < as; i++) sides.push('a');
    const minutes = new Set<number>();
    while (minutes.size < sides.length) minutes.add(1 + Math.floor(random() * 90));
    const ms = [...minutes].sort((x, y) => x - y);
    for (let i = sides.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [sides[i], sides[j]] = [sides[j], sides[i]];
    }
    const goals: Goal[] = ms.map((m, i) => ({ m, s: sides[i], who: scorer(g, sides[i] === 'h' ? f.home : f.away) }));
    // a few near misses for the match view
    const chances: Chance[] = [];
    const used = new Set(ms);
    const count = 2 + Math.floor(random() * 4);
    for (let k = 0; k < count; k++) {
      let m = 3 + Math.floor(random() * 86);
      while (used.has(m) || used.has(m - 1) || used.has(m + 1)) m = 3 + Math.floor(random() * 86);
      used.add(m);
      const s = random() < pw / (pw + f.probs[2]) ? 'h' : 'a';
      chances.push({
        m,
        s,
        who: scorer(g, s === 'h' ? f.home : f.away),
        how: weighted(['saved', 'wide', 'off the bar', 'blocked'], [45, 30, 10, 15]),
      });
    }
    chances.sort((x, y) => x.m - y.m);
    return { home: f.home, away: f.away, outcome, homeGoals: hs, awayGoals: as, goals, chances };
  }

  const prize = (g: Active, wins: number) => (wins <= 0 ? 0 : roundMoney(g.stake * g.ladder[wins - 1]));

  return {
    init() {
      if (initError) return fail(initError);
      const leagues = Object.entries(LMS_DATA.leagues).map(([id, l]) => ({ id, name: l.name }));
      return reply({ balance, currency, stakes: STAKES, leagues, modes: MODES });
    },

    start(league, mode, stake) {
      if (active && !active.over) return fail('GAME_ACTIVE');
      const L = LMS_DATA.leagues[league];
      if (!L) return fail('INVALID_LEAGUE');
      const M = LMS_DATA.modes[mode];
      if (!M) return fail('INVALID_MODE');
      if (!STAKES.includes(stake)) return fail('INVALID_STAKE');
      if (roundMoney(stake) > roundMoney(balance)) return fail('INSUFFICIENT_BALANCE');
      balance = roundMoney(balance - stake);
      const li = Math.floor(random() * M.pool.length);
      const teams = L.teams.map(toTeam);
      const byCode = new Map(teams.map((t) => [t.code, t]));
      const order = M.pool[li].map((i) => teams[i].code);
      const schedule = buildSchedule(order).map((week) =>
        week.map(([home, away]): Fixture => ({ home, away, probs: matchProbs(byCode.get(home)!, byCode.get(away)!) })),
      );
      active = {
        id: `lms-${++seq}`,
        league,
        mode,
        stake,
        teams,
        schedule,
        ladder: M.ladders[li],
        best: M.best[li],
        gap: M.gap[league][li],
        gw: 0,
        wins: 0,
        used: [],
        history: [],
        over: false,
        raw: L.teams,
      };
      return reply({ balance, game: snapshot(active) });
    },

    pick(gameId, code) {
      const g = active;
      if (!g || g.id !== gameId) return fail('NO_GAME');
      if (g.over) return fail('GAME_OVER');
      if (!g.teams.some((t) => t.code === code)) return fail('UNKNOWN_TEAM');
      if (g.used.includes(code)) return fail('TEAM_USED');
      const results = g.schedule[g.gw].map((f) => playMatch(g, f));
      const mine = results.find((r) => r.home === code || r.away === code)!;
      const isHome = mine.home === code;
      const won = (isHome && mine.outcome === 'H') || (!isHome && mine.outcome === 'A');
      const opp = isHome ? mine.away : mine.home;
      g.used.push(code);
      g.history.unshift({
        gw: g.gw + 1,
        code,
        score: `${isHome ? mine.homeGoals : mine.awayGoals}-${isHome ? mine.awayGoals : mine.homeGoals} ${isHome ? 'v' : 'at'} ${opp}`,
        won,
        outcome: mine.outcome,
      });
      let payout = 0;
      if (won) {
        g.wins += 1;
        g.gw += 1;
        if (g.wins >= ROUNDS) {
          g.over = true;
          payout = prize(g, g.wins);
          balance = roundMoney(balance + payout);
        }
      } else {
        g.over = true;
      }
      return reply({ balance, game: snapshot(g), mine: code, won, results, payout });
    },

    resetDemoBalance() {
      if (active && !active.over) return fail('GAME_ACTIVE');
      balance = startBalance;
      return reply({ balance });
    },

    cashOut(gameId) {
      const g = active;
      if (!g || g.id !== gameId) return fail('NO_GAME');
      if (g.over) return fail('GAME_OVER');
      if (g.wins < 1) return fail('CANNOT_CASH_OUT');
      const amount = prize(g, g.wins);
      balance = roundMoney(balance + amount);
      g.over = true;
      return reply({ balance, game: snapshot(g), amount });
    },
  };
}
