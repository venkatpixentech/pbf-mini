import { useEffect, useMemo, useRef, useState } from 'react';

import { formatMoney } from 'core/services/money';

import type { CashOutResponse, PickResponse, Team } from '../api/types';
import { ballPath, prizeFor } from '../lib';
import { Badge, HdaBar } from '../ui';

const ROUNDS = 20;
const DURATION_MS = 9000;

type Props = {
  res: PickResponse;
  currency: string;
  busy: boolean;
  onNext: () => void;
  onCashOut: () => void;
  onNew: () => void;
};

/** Plays back the server's result for the picked match: score, events and a cosmetic ball path. */
export function Match({ res, currency, busy, onNext, onCashOut, onNew }: Props) {
  const { game, mine } = res;
  const teams = useMemo(() => new Map(game.teams.map((t) => [t.code, t])), [game.teams]);
  const m = res.results.find((r) => r.home === mine || r.away === mine)!;
  const home = teams.get(m.home)!;
  const away = teams.get(m.away)!;
  const gw = game.history[0].gw;
  const fixture = game.schedule[gw - 1].find((f) => f.home === m.home)!;

  const items = useMemo(
    () =>
      [...m.goals.map((g) => ({ ...g, goal: true, how: '' })), ...m.chances.map((c) => ({ ...c, goal: false }))].sort(
        (a, b) => a.m - b.m,
      ),
    [m],
  );
  const [path] = useState(() =>
    ballPath(
      items.map((i) => ({ m: i.m, s: i.s, goal: i.goal })),
      (fixture.probs[0] - fixture.probs[2]) * 6,
    ),
  );

  const [minute, setMinute] = useState(0);
  const [done, setDone] = useState(false);
  const skip = useRef(false);
  const reduce = useRef(typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches);

  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const step = (now: number) => {
      const t = reduce.current || skip.current ? 1 : Math.min(1, (now - start) / DURATION_MS);
      setMinute(t * 90);
      if (t < 1) raf = requestAnimationFrame(step);
      else setDone(true);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, []);

  const min = Math.floor(minute);
  const shown = items.filter((i) => i.m <= (done ? 90 : min));
  const hs = shown.filter((i) => i.goal && i.s === 'h').length;
  const as = shown.filter((i) => i.goal && i.s === 'a').length;
  const idx = Math.min(90, min);
  const f = minute - idx;
  const bx = path.x[idx] + (path.x[Math.min(91, idx + 1)] - path.x[idx]) * f;
  const by = path.y[idx] + (path.y[Math.min(91, idx + 1)] - path.y[idx]) * f;
  const flash = !done ? [...shown].reverse().find((i) => i.goal && min - i.m <= 8) : undefined;
  const clock = done ? 'Full time' : min === 0 ? 'Kick-off' : min === 45 ? 'HT' : `${min}'`;
  const nameOf = (code: string, who: string | null) =>
    who ? `${who} (${teams.get(code)!.name})` : teams.get(code)!.name;
  const goalMarks = m.goals;

  return (
    <section className="lms-match pbf-card">
      <p className="gw">
        Game week {gw}: you backed {teams.get(mine)!.name}
      </p>
      <div className="board">
        <Side team={home} mine={mine === home.code} />
        <div className="score" aria-live="polite">
          {done ? m.homeGoals : hs}-{done ? m.awayGoals : as}
        </div>
        <Side team={away} mine={mine === away.code} />
      </div>
      <HdaBar fixture={fixture} teams={teams} />

      {!done && (
        <div className="sim">
          <div className="pv">
            <svg className="mk" viewBox="0 0 105 68" preserveAspectRatio="none" aria-hidden="true" fill="none">
              <rect x="1" y="1" width="103" height="66" />
              <line x1="52.5" y1="1" x2="52.5" y2="67" />
              <circle cx="52.5" cy="34" r="9.15" />
              <rect x="1" y="13.85" width="16.5" height="40.3" />
              <rect x="87.5" y="13.85" width="16.5" height="40.3" />
              <rect x="1" y="24.85" width="5.5" height="18.3" />
              <rect x="98.5" y="24.85" width="5.5" height="18.3" />
            </svg>
            <span className="end l">{home.name} &rarr;</span>
            <span className="end r">&larr; {away.name}</span>
            <div className={`pl${bx < 35 ? ' aw' : ''}`} style={{ left: `${bx}%` }} />
            <div className="ball" style={{ left: `${bx}%`, top: `${by}%` }} />
            <div className={`flash${flash ? ' on' : ''}`}>
              GOAL
              {flash && <small>{nameOf(flash.s === 'h' ? m.home : m.away, flash.who)}</small>}
            </div>
          </div>
          <div className="tl">
            <i style={{ width: `${(minute / 90) * 100}%` }} />
            {goalMarks
              .filter((g) => g.m <= min)
              .map((g) => (
                <b key={g.m} className={g.s} style={{ left: `${(g.m / 90) * 100}%` }} />
              ))}
          </div>
          <div className="simbar">
            <span className="clock">{clock}</span>
            <button className="skip" onClick={() => (skip.current = true)}>
              Skip to result
            </button>
          </div>
        </div>
      )}
      {done && <p className="clock">Full time</p>}

      <ul className="events">
        {shown.map((i) => (
          <li key={`${i.m}${i.goal}`} className={`${i.s}${i.goal ? '' : ' ch'}`}>
            {i.m}&apos; {i.goal ? 'Goal: ' : ''}
            {nameOf(i.s === 'h' ? m.home : m.away, i.who)}
            {i.goal ? '' : `: ${i.how}`}
          </li>
        ))}
      </ul>

      {done && (
        <Verdict
          res={res}
          currency={currency}
          busy={busy}
          onNext={onNext}
          onCashOut={onCashOut}
          onNew={onNew}
          teams={teams}
        />
      )}
    </section>
  );
}

function Side({ team, mine }: { team: Team; mine: boolean }) {
  return (
    <div className={`t${mine ? ' mine' : ''}`}>
      <Badge team={team} />
      <span>{team.name}</span>
    </div>
  );
}

function Verdict({ res, currency, busy, teams, onNext, onCashOut, onNew }: Props & { teams: Map<string, Team> }) {
  const { game, won } = res;
  const m = res.results.find((r) => r.home === res.mine || r.away === res.mine)!;
  const bank = prizeFor(game, game.wins);
  const final = game.wins === ROUNDS - 1;
  let title: string;
  let text: string;
  let actions: React.ReactNode;
  if (won && game.over) {
    title = 'Last man standing';
    text = `All 20 picks won. The top prize of ${formatMoney(res.payout, currency)} has been added to your balance.`;
    actions = (
      <button className="pbf-btn" onClick={onNew}>
        New game
      </button>
    );
  } else if (won) {
    title = final ? 'Through to the final round' : `Through to round ${game.wins + 1}`;
    text = final
      ? `One pick left, with your last team. Win it to take the top prize of ${formatMoney(prizeFor(game, ROUNDS), currency)}, or cash out now for ${formatMoney(bank, currency)}.`
      : `Cash out now for ${formatMoney(bank, currency)}, or play on to win ${formatMoney(prizeFor(game, game.wins + 1), currency)}.`;
    actions = (
      <>
        <button className="pbf-btn secondary" disabled={busy} onClick={onCashOut}>
          Cash out {formatMoney(bank, currency)}
        </button>
        <button className="pbf-btn" disabled={busy} onClick={onNext}>
          {final ? 'Play the final round' : `Play round ${game.wins + 1}`}
        </button>
      </>
    );
  } else {
    title = m.outcome === 'D' ? 'A draw. You are out.' : 'Beaten. You are out.';
    text = game.wins
      ? `You survived ${game.wins} round${game.wins > 1 ? 's' : ''}. Cashing out before this game week would have paid ${formatMoney(bank, currency)}.`
      : 'Out in round 1.';
    actions = (
      <button className="pbf-btn" onClick={onNew}>
        New game
      </button>
    );
  }
  const others = res.results.filter((r) => r !== m);
  return (
    <div className="result">
      <div className={`verdict ${won ? 'win' : 'lose'}`}>
        <h3>{title}</h3>
        <p>{text}</p>
      </div>
      <div className={`actions${won && !game.over ? '' : ' one'}`}>{actions}</div>
      <div className="others">
        <div className="hd">Other results this game week</div>
        {others.map((r) => (
          <span key={r.home} style={{ display: 'contents' }}>
            <span className="h">{teams.get(r.home)!.name}</span>
            <span className="s">
              {r.homeGoals}-{r.awayGoals}
            </span>
            <span>{teams.get(r.away)!.name}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

/** Shown after cashing out. */
export function Banked({
  res,
  currency,
  stake,
  onNew,
}: {
  res: CashOutResponse;
  currency: string;
  stake: number;
  onNew: () => void;
}) {
  return (
    <section className="lms-match pbf-card">
      <p className="gw">Cashed out after round {res.game.wins}</p>
      <div className="score big">{formatMoney(res.amount, currency)}</div>
      <div className="verdict win">
        <h3>Banked</h3>
        <p>
          {formatMoney(res.amount, currency)} added to your balance from a {formatMoney(stake, currency)} stake.
        </p>
      </div>
      <div className="actions one">
        <button className="pbf-btn" onClick={onNew}>
          New game
        </button>
      </div>
    </section>
  );
}
