import { useState } from 'react';

import { formatMoney } from 'core/services/money';
import { GameLayout } from 'core/ui/GameLayout';

import type { Game, Team } from '../api/types';
import { prizeFor, quality, qualityWord, short, slotOf, teamMap } from '../lib';
import { Badge, HdaBar, HdaKey, type LayoutFrame } from '../ui';
import { Guide } from './Guide';

type Props = {
  game: Game;
  currency: string;
  busy: boolean;
  onPlay: (code: string) => void;
  onCashOut: () => void;
  frame: LayoutFrame;
};

type Sort = 'now' | 'best' | 'rating';
const ROUNDS = 20;

export function Play({ game, currency, busy, onPlay, onCashOut, frame }: Props) {
  const teams = teamMap(game);
  const [pick, setPick] = useState<string | null>(null);
  const bank = prizeFor(game, game.wins);
  const next = prizeFor(game, game.wins + 1);
  const choose = (code: string) => setPick((p) => (p === code ? null : code));
  const pickSlot = pick ? slotOf(game, game.gw, pick) : null;

  return (
    <GameLayout
      className="lastmanstanding lms-play"
      header={
        <>
          {frame.header}
          <div className="lms-stats">
            <div className="pbf-card">
              <small>Round</small>
              <b>
                {Math.min(game.wins + 1, ROUNDS)} of {ROUNDS}
              </b>
            </div>
            <div className="pbf-card">
              <small>Cash out now</small>
              <b>{formatMoney(bank, currency)}</b>
            </div>
            <div className="pbf-card next">
              <small>Win this round</small>
              <b>{formatMoney(next, currency)}</b>
            </div>
          </div>
        </>
      }
      stage={
        <section className="lms-week" aria-label={`Game week ${game.gw + 1}`}>
          <div className="lms-gwhead">
            <h3>
              Game week {game.gw + 1}
              {game.wins === ROUNDS - 1 ? ' (final round)' : ''}
            </h3>
            <HdaKey />
          </div>
          <div className="lms-fixtures">
            {game.schedule[game.gw].map((f) => (
              <div className="pbf-card lms-mc" key={f.home}>
                <div className="lms-mc-top">
                  <PickButton game={game} team={teams.get(f.home)!} home pick={pick} onPick={choose} />
                  <div className="lms-cmp">
                    {(['att', 'def', 'cre'] as const).map((k) => {
                      const H = teams.get(f.home)!;
                      const A = teams.get(f.away)!;
                      return (
                        <span key={k} style={{ display: 'contents' }}>
                          <span className={H[k] > A[k] ? 'hi' : ''}>{H[k]}</span>
                          <em>{k.toUpperCase()}</em>
                          <span className={A[k] > H[k] ? 'hi' : ''}>{A[k]}</span>
                        </span>
                      );
                    })}
                  </div>
                  <PickButton game={game} team={teams.get(f.away)!} home={false} pick={pick} onPick={choose} />
                </div>
                <HdaBar fixture={f} teams={teams} />
              </div>
            ))}
          </div>
        </section>
      }
      controls={
        <>
          <div className="lms-lockbar">
            <p>
              {pick && pickSlot ? (
                <>
                  Your pick: <b>{teams.get(pick)!.name}</b> · {pickSlot.home ? 'home to ' : 'away at '}
                  {teams.get(pickSlot.opp)!.name}
                </>
              ) : (
                'Tap a team above to back it to win'
              )}
            </p>
            <div className="lms-actions">
              <button className="pbf-btn secondary lms-cash" disabled={game.wins < 1 || busy} onClick={onCashOut}>
                {game.wins < 1 ? 'Cash out after R1' : `Cash out ${formatMoney(bank, currency)}`}
              </button>
              <button className="pbf-btn" disabled={!pick || busy} onClick={() => pick && onPlay(pick)}>
                {busy ? 'Playing...' : 'Play game week'}
              </button>
            </div>
          </div>
          {frame.notice}
        </>
      }
      infoLabel="Prize ladder, planner and rules"
      info={
        <>
          <p className="lms-hint">
            <b>Tap a team to pick them to win.</b> A win takes you through; a draw or defeat and you are out.
          </p>
          <Ladder game={game} currency={currency} />
          <h3 className="lms-info-title">Fixture planner</h3>
          <Planner game={game} teams={teams} onBack={(code) => setPick(code)} />
          <TeamGrid game={game} pick={pick} onPick={choose} />
          <Guide game={game} />
          {frame.footer}
        </>
      }
    />
  );
}

function PickButton({
  game,
  team,
  home,
  pick,
  onPick,
}: {
  game: Game;
  team: Team;
  home: boolean;
  pick: string | null;
  onPick: (code: string) => void;
}) {
  const used = game.used.includes(team.code);
  const on = pick === team.code;
  return (
    <button
      className={`lms-pick ${home ? 'home' : 'away'}`}
      disabled={used}
      aria-pressed={on}
      aria-label={`Back ${team.name}, OVR ${team.ovr}${home ? ', at home' : ', away'}${used ? ', already used' : ''}`}
      onClick={() => onPick(team.code)}
    >
      <Badge team={team} />
      <span className="nm">{team.name}</span>
      <span className="tag">{used ? 'Used' : on ? 'Picked' : 'Pick'}</span>
    </button>
  );
}

function Ladder({ game, currency }: { game: Game; currency: string }) {
  return (
    <aside className="lms-ladder" aria-label="Prize ladder">
      <h3>Prize ladder</h3>
      <ol>
        {game.ladder.map((m, i) => {
          const cls =
            i < game.wins - 1 ? 'done' : i === game.wins - 1 ? 'banked' : i === game.wins && !game.over ? 'target' : '';
          return (
            <li
              key={i}
              className={`${cls}${i === ROUNDS - 1 ? ' top' : ''}`}
              ref={(el) => {
                if (el && (cls === 'target' || (cls === 'banked' && game.over))) {
                  const list = el.parentElement!;
                  list.scrollLeft = el.offsetLeft - list.clientWidth / 2 + el.clientWidth / 2;
                }
              }}
            >
              <span className="n">R{i + 1}</span>
              <span className="x">{m}x</span>
              <span className="v">{short(game.stake * m, currency)}</span>
            </li>
          );
        })}
      </ol>
    </aside>
  );
}

function Planner({ game, teams, onBack }: { game: Game; teams: Map<string, Team>; onBack: (code: string) => void }) {
  const [sort, setSort] = useState<Sort>('now');
  const [open, setOpen] = useState<Set<string>>(new Set());
  const weeks: number[] = [];
  for (let g = game.gw; g < Math.min(game.gw + 8, game.schedule.length); g++) weeks.push(g);
  const rows = game.teams
    .filter((t) => !game.used.includes(t.code))
    .map((t) => {
      const ps = weeks.map((g) => slotOf(game, g, t.code).winChance);
      return { t, ps, bi: ps.indexOf(Math.max(...ps)) };
    });
  if (sort === 'now') rows.sort((x, y) => y.ps[0] - x.ps[0]);
  else if (sort === 'best') rows.sort((x, y) => y.ps[y.bi] - x.ps[x.bi]);
  else rows.sort((x, y) => y.t.ovr - x.t.ovr);
  const toggle = (code: string) =>
    setOpen((s) => {
      const n = new Set(s);
      if (n.has(code)) n.delete(code);
      else n.add(code);
      return n;
    });

  return (
    <>
      <div className="lms-gwhead">
        <h3>Plan ahead</h3>
        <p>Next 8 opponents for each team you have left. Tap a team to see its fixtures.</p>
      </div>
      <div className="lms-sort" role="group" aria-label="Sort teams">
        <span>Sort by</span>
        {(
          [
            ['now', 'This week'],
            ['best', 'Best week ahead'],
            ['rating', 'OVR'],
          ] as const
        ).map(([id, label]) => (
          <button key={id} className="lms-chip" aria-pressed={sort === id} onClick={() => setSort(id)}>
            {label}
          </button>
        ))}
      </div>
      <div className="pbf-card lms-plan">
        <div className="lms-phdr">
          <div className="cells">
            {weeks.map((g, i) => (
              <span key={g} className={i === 0 ? 'now' : ''}>
                {i === 0 ? 'Now' : g + 1}
              </span>
            ))}
          </div>
        </div>
        {rows.map(({ t, ps, bi }) => {
          const isOpen = open.has(t.code);
          const best = slotOf(game, weeks[bi], t.code);
          const bo = teams.get(best.opp)!;
          return (
            <div className="lms-pitem" key={t.code}>
              <button className="lms-prow" aria-expanded={isOpen} onClick={() => toggle(t.code)}>
                <span className="pname">
                  <Badge team={t} small />
                  <span>
                    <b>{t.name}</b>
                    <small>
                      Best: GW{weeks[bi] + 1} {best.home ? 'home to' : 'away at'} {bo.code} ({bo.ovr})
                    </small>
                  </span>
                </span>
                <span className="cells">
                  {weeks.map((g, i) => {
                    const s = slotOf(game, g, t.code);
                    const o = teams.get(s.opp)!;
                    return (
                      <span
                        key={g}
                        className={`cell ${quality(ps[i])}${i === bi ? ' best' : ''}`}
                        title={`GW${g + 1}: ${s.home ? 'home to' : 'away at'} ${o.name} (${o.ovr}), ${qualityWord(ps[i])}`}
                      >
                        {o.code}
                        <i>{s.home ? 'H' : 'A'}</i>
                      </span>
                    );
                  })}
                </span>
              </button>
              {isOpen && (
                <div className="lms-pdetail">
                  {weeks.map((g, i) => {
                    const s = slotOf(game, g, t.code);
                    const o = teams.get(s.opp)!;
                    return (
                      <div className={`pline${i === bi ? ' best' : ''}`} key={g}>
                        <span className="g">{i === 0 ? 'Now' : `GW${g + 1}`}</span>
                        <div className="who">
                          {s.home ? 'Home to ' : 'Away at '}
                          {o.name}
                          <HdaBar fixture={s.fixture} teams={teams} thin />
                        </div>
                        <Badge team={o} small />
                      </div>
                    );
                  })}
                  <button className="lms-back" onClick={() => onBack(t.code)}>
                    Back {t.name} this week
                  </button>
                </div>
              )}
            </div>
          );
        })}
        {game.used.length > 0 && (
          <div className="lms-used">Used: {game.used.map((c) => teams.get(c)!.name).join(', ')}</div>
        )}
      </div>
      <div className="lms-legend">
        <span>
          <i className="q1" />
          Easy
        </span>
        <span>
          <i className="q2" />
          Fair
        </span>
        <span>
          <i className="q3" />
          Tough
        </span>
        <span>
          <i className="q4" />
          Very tough
        </span>
      </div>
    </>
  );
}

function TeamGrid({ game, pick, onPick }: { game: Game; pick: string | null; onPick: (code: string) => void }) {
  const teams = teamMap(game);
  const left = game.teams.filter((t) => !game.used.includes(t.code)).sort((a, b) => b.ovr - a.ovr);
  return (
    <section className="pbf-card lms-teams">
      <div className="th">
        <h3>Your 20 teams</h3>
        <span>{left.length} left</span>
      </div>
      <div className="tgrid">
        {left.map((t) => {
          const s = slotOf(game, game.gw, t.code);
          const sel = pick === t.code;
          return (
            <button key={t.code} className={`tt${sel ? ' sel' : ''}`} aria-pressed={sel} onClick={() => onPick(t.code)}>
              <Badge team={t} small />
              <span>
                <b>{t.name}</b>
                <small>
                  {sel ? 'Picked this week' : `${s.home ? 'Home to' : 'Away at'} ${teams.get(s.opp)!.name}`}
                </small>
              </span>
            </button>
          );
        })}
        {game.history.length > 0 && <div className="tsep">Used</div>}
        {game.history.map((h) => (
          <div key={h.gw} className="tt gone">
            <Badge team={teams.get(h.code)!} small />
            <span>
              <b>{teams.get(h.code)!.name}</b>
              <small className={h.won ? 'won' : ''}>
                GW{h.gw}: {h.won ? 'won' : h.outcome === 'D' ? 'drew' : 'lost'} {h.score}
              </small>
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
