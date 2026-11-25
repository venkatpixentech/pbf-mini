import { formatMoney } from 'core/services/money';
import { StakeChips } from 'core/ui/StakeChips';

import type { InitResponse } from '../api/types';
import { short } from '../lib';
import { Guide } from './Guide';

type Props = {
  init: InitResponse;
  balance: number;
  stake: number;
  league: string;
  mode: string;
  busy: boolean;
  onStake: (v: number) => void;
  onLeague: (v: string) => void;
  onMode: (v: string) => void;
  onStart: () => void;
  onResetBalance: () => void;
};

export function Setup({
  init,
  balance,
  stake,
  league,
  mode,
  busy,
  onStake,
  onLeague,
  onMode,
  onStart,
  onResetBalance,
}: Props) {
  const { currency } = init;
  const top = init.modes.find((m) => m.id === mode)?.top ?? 0;
  const tooLow = balance < stake;
  return (
    <>
      <section className="lms-intro">
        <h2>Pick a winner every game week. Use each team once.</h2>
        <p>
          Choose a league and you get all 20 of its clubs. Every game week you back one of them to win. A win takes you
          up the prize ladder; a draw or a defeat knocks you out.
        </p>
        <ul className="lms-rules">
          <li>Each team can be picked once, so save the strong sides for the weeks they really need to win.</li>
          <li>The full fixture list is visible from the start.</li>
          <li>Cash out after any round you survive, or keep going for a bigger prize.</li>
        </ul>
      </section>

      <section className="pbf-card lms-panel">
        <span className="pbf-caption" id="lms-league">
          Choose a league
        </span>
        <div className="lms-options" role="group" aria-labelledby="lms-league">
          {init.leagues.map((l) => (
            <button key={l.id} className="lms-opt" aria-pressed={l.id === league} onClick={() => onLeague(l.id)}>
              <b>{l.name}</b>
              <small>20 clubs, same odds</small>
            </button>
          ))}
        </div>

        <span className="pbf-caption" id="lms-mode">
          Choose your difficulty
        </span>
        <div className="lms-options" role="group" aria-labelledby="lms-mode">
          {init.modes.map((m) => (
            <button key={m.id} className="lms-opt" aria-pressed={m.id === mode} onClick={() => onMode(m.id)}>
              <b>{m.name}</b>
              <small>{m.desc}</small>
              <span className="tp">Top prize {short(stake * m.top, currency)}</span>
            </button>
          ))}
        </div>

        <StakeChips stakes={init.stakes} value={stake} onChange={onStake} currency={currency} disabled={busy} />
        <button className="pbf-btn" disabled={busy || tooLow} onClick={onStart}>
          {busy ? 'Dealing...' : `Start for ${short(stake, currency)}`}
        </button>
        <p className="lms-note">
          {tooLow
            ? `Your balance of ${formatMoney(balance, currency)} is too low for this stake.`
            : `Win all 20 picks to take the top prize of ${short(stake * top, currency)} (${top.toLocaleString('en-GB')}x your stake). The rest of the ladder is priced on the fixture list you are dealt.`}
        </p>
        {tooLow && (
          <button className="pbf-btn secondary" disabled={busy} onClick={onResetBalance}>
            Reset demo balance
          </button>
        )}
      </section>

      <Guide />
    </>
  );
}
