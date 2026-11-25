import './accaCrash.css';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { assetUrl } from 'core/boot/assetUrl';
import type { GameScreenProps } from 'core/game/defineGame';
import { useApiMessage } from 'core/hooks/useApiMessage';
import { useRoundEngine } from 'core/hooks/useRoundEngine';
import { CanvasFrame } from 'core/pixi/CanvasFrame';
import { PixiStage, type StageError } from 'core/pixi/PixiStage';
import { createActionGuard, retryWithSameKey } from 'core/round/actionGuard';
import { useAtServerTime, useCountdown } from 'core/round/react';
import { createServerClock, timed } from 'core/round/serverClock';
import { ApiError } from 'core/services/apiError';
import { formatMoney } from 'core/services/money';
import type { PhaseDef } from 'core/services/RoundEngine';
import { GameHeader } from 'core/ui/GameHeader';
import { GameLayout } from 'core/ui/GameLayout';
import { StakeChips } from 'core/ui/StakeChips';

import type { AccaCrashApi, Bet, GoalEvent, InitResponse, Panel, StatusResponse } from './api/types';
import { type CrowdBet, generateCrowd, settleCrowd } from './crowd';
import { crashCurveConfig } from './scenes/crashCurve.config';
import { CrashCurveScene } from './scenes/CrashCurveScene';

type CrowdTab = 'all' | 'previous' | 'top';
const CROWD_SIZE = 12;

type Phase = 'betting' | 'running' | 'ended';
const PHASES: Record<Phase, PhaseDef<Phase>> = {
  betting: { next: 'running' },
  running: { next: 'ended' },
  ended: { next: 'betting' },
};
const isNetworkError = (e: unknown) => !(e instanceof ApiError);
const POLL_MS = 100;
const PANELS: Panel[] = [0, 1];
const createScene = () => new CrashCurveScene();

const ERROR_TEXT: Record<string, string> = {
  ROUND_CLOSED: 'Betting is closed for this round.',
  ROUND_NOT_OPEN: 'Betting has not opened yet.',
  ROUND_NOT_STARTED: 'The round has not started yet.',
  ROUND_NOT_READY: 'The next round is not ready yet.',
  INSUFFICIENT_BALANCE: 'Not enough balance for that stake.',
  INVALID_STAKE: 'That stake is not allowed.',
  INVALID_AUTO: 'That auto cash-out is not allowed.',
  NO_BET: 'No active bet on this panel.',
  BET_EXISTS: 'This panel already has a bet.',
};

/** Acca Crash: React owns UI, state and API calls; Pixi only renders the curve. Booted by the core. */
export function AccaCrashScreen({ api, init }: GameScreenProps<AccaCrashApi, InitResponse>) {
  const { currency, stakes, autoOptions } = init;
  const [balance, setBalance] = useState(init.balance);
  const [round, setRound] = useState(init.round);
  const [history, setHistory] = useState(init.history);
  const [panelStake, setPanelStake] = useState<[number, number]>([stakes[0], stakes[0]]);
  const [panelAuto, setPanelAuto] = useState<[number | null, number | null]>([null, null]);
  const [bets, setBets] = useState<Bet[]>([]);
  const [live, setLive] = useState<{ points: Array<[number, number]>; multiplier: number; crashed: boolean }>({
    points: [],
    multiplier: 1,
    crashed: false,
  });
  const [goals, setGoals] = useState<GoalEvent[]>([]);
  const [flash, setFlash] = useState<{ id: number; scorer: string; boost: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const { message, setMessage, fail } = useApiMessage(ERROR_TEXT);
  // Splash shown every load, matching the prototype (componentDidMount always sets splash: true).
  const [splash, setSplash] = useState(true);
  const [crowd, setCrowd] = useState(() => generateCrowd(CROWD_SIZE, Math.random));
  const [crowdTab, setCrowdTab] = useState<CrowdTab>('all');
  const [previousCrowd, setPreviousCrowd] = useState<CrowdBet[]>([]);
  const stageRef = useRef<HTMLDivElement>(null);
  const crashShown = useRef(false);
  const poll = useRef<ReturnType<typeof setInterval> | null>(null);
  const goalsSeen = useRef(0);
  const money = (n: number) => formatMoney(n, currency);
  // pbfShake from the prototype, played with the Web Animations API so the Pixi stage is not remounted
  const shake = (ms: number) =>
    stageRef.current?.animate(
      [0, -5, 5, -3, 3, 0].map((px) => ({ transform: `translateX(${px}px)` })),
      { duration: ms, easing: 'cubic-bezier(0.2, 0.6, 0.2, 1)' },
    );
  const stopPolling = () => {
    if (poll.current) clearInterval(poll.current);
    poll.current = null;
  };
  useEffect(() => stopPolling, []);
  const [nextRoundOpensAt, setNextRoundOpensAt] = useState<number | null>(null);
  const seqRef = useRef(0);
  const clock = useMemo(() => {
    const c = createServerClock();
    c.observeApprox(init.round.timing.serverTime);
    return c;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const guard = useMemo(() => createActionGuard(), []);

  const { engine, phase } = useRoundEngine(PHASES, 'betting', ({ from, to }) => {
    if (to === 'running') {
      const id = round.id;
      setLive({ points: [[0, 1]], multiplier: 1, crashed: false });
      seqRef.current = 0;
      poll.current = setInterval(() => api.status(id).then(apply, fail), POLL_MS);
    }
    if (to === 'betting' && from === 'ended') {
      // round reset was done in the useAtServerTime callback below
    }
  });

  function apply(s: StatusResponse) {
    clock.observeApprox(s.serverTime);
    if (s.seq <= seqRef.current) return;
    seqRef.current = s.seq;
    setBalance(s.balance);
    setBets(s.bets);
    if (s.goals.length > goalsSeen.current) {
      const boosted = s.goals.slice(goalsSeen.current).filter((g) => g.mine && g.boost > 0);
      goalsSeen.current = s.goals.length;
      setGoals(s.goals);
      const g = boosted[boosted.length - 1];
      if (g) {
        setFlash({ id: s.goals.length, scorer: g.scorer, boost: g.boost });
        shake(420);
      }
    }
    setLive((prev) => {
      if (prev.crashed) return prev;
      const points = [...prev.points, [s.elapsedMs, s.multiplier] as [number, number]].slice(-600);
      return { points, multiplier: s.multiplier, crashed: s.crashed };
    });
    if (s.crashed) {
      if (s.nextOpensAt) setNextRoundOpensAt(s.nextOpensAt);
      if (!crashShown.current) {
        crashShown.current = true;
        shake(520);
        setPreviousCrowd(settleCrowd(crowd, s.multiplier, true));
      }
      stopPolling();
      if (engine.phase === 'running') engine.advance();
    }
  }

  useAtServerTime(clock, phase === 'betting' ? round.timing.closesAt : null, () => {
    if (engine.phase === 'betting') engine.advance();
  });
  useAtServerTime(clock, phase === 'ended' ? nextRoundOpensAt : null, () => {
    if (engine.phase !== 'ended') return;
    const fetchNext = (): void => {
      api.next().then(
        (r) => {
          clock.observeApprox(r.serverTime);
          setRound(r.round);
          setHistory(r.history);
          setBets([]);
          goalsSeen.current = 0;
          setGoals([]);
          setFlash(null);
          crashShown.current = false;
          setMessage(null);
          setLive({ points: [], multiplier: 1, crashed: false });
          setCrowd(generateCrowd(CROWD_SIZE, Math.random));
          setNextRoundOpensAt(null);
          seqRef.current = 0;
          engine.advance();
        },
        (e) => {
          if (e instanceof ApiError && e.code === 'ROUND_NOT_READY') setTimeout(fetchNext, 200);
          else fail(e);
        },
      );
    };
    fetchNext();
  });
  const { secondsLeft } = useCountdown(clock, round.timing.opensAt, round.timing.closesAt);

  const onSceneError = useCallback((e: StageError) => setMessage(`Display error (${e.kind}).`), [setMessage]);

  const placeBetAction = async (p: Panel) => {
    if (busy || phase !== 'betting') return;
    setBusy(true);
    try {
      const r = await guard.run(`placeBet:${round.id}:${p}`, (id) =>
        retryWithSameKey(
          (requestId) =>
            timed(
              clock,
              () => api.placeBet(round.id, p, panelStake[p], panelAuto[p], requestId),
              (x) => x.serverTime,
            ),
          { shouldRetry: isNetworkError },
          id,
        ),
      );
      setBalance(r.balance);
      setBets(r.bets);
      setMessage(null);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  const cancelBetAction = async (p: Panel) => {
    if (busy || phase !== 'betting') return;
    setBusy(true);
    try {
      const r = await guard.run(`cancelBet:${round.id}:${p}`, (id) =>
        retryWithSameKey(
          (requestId) =>
            timed(
              clock,
              () => api.cancelBet(round.id, p, requestId),
              (x) => x.serverTime,
            ),
          { shouldRetry: isNetworkError },
          id,
        ),
      );
      setBalance(r.balance);
      setBets(r.bets);
      setMessage(null);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  const doCashOut = async (p: Panel) => {
    if (busy) return;
    setBusy(true);
    try {
      const r = await guard.run(`cashOut:${round.id}:${p}`, (id) =>
        retryWithSameKey(
          (requestId) =>
            timed(
              clock,
              () => api.cashOut(round.id, p, requestId),
              (x) => x.serverTime,
            ),
          { shouldRetry: isNetworkError },
          id,
        ),
      );
      apply(r);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  const betting = phase === 'betting';
  const countdown = betting ? secondsLeft : null;

  const latestGoal = goals[goals.length - 1];
  const liveCrowd = settleCrowd(crowd, live.multiplier, live.crashed);
  const shownCrowd = crowdTab === 'previous' ? previousCrowd : liveCrowd;
  const topCrowd = [...liveCrowd].filter((b) => b.cashedAt).sort((a, b) => b.payout - a.payout);
  const crowdRows = crowdTab === 'top' ? topCrowd : shownCrowd;
  const cashedCount = shownCrowd.filter((b) => b.cashedAt).length;
  const totalWon = shownCrowd.reduce((sum, b) => sum + b.payout, 0);
  const setAuto = (p: Panel, a: number | null) => setPanelAuto((v) => (p === 0 ? [a, v[1]] : [v[0], a]));
  const setStakeFor = (p: Panel, s: number) => setPanelStake((v) => (p === 0 ? [s, v[1]] : [v[0], s]));
  const stepStake = (p: Panel, dir: 1 | -1) => {
    const i = stakes.indexOf(panelStake[p]);
    setStakeFor(p, stakes[Math.min(stakes.length - 1, Math.max(0, i + dir))]);
  };

  const splashCards = round.cards.slice(0, 3);
  return (
    <GameLayout
      className="acca"
      overlays={
        <>
          {splash && (
            <div className="acca-splash" role="dialog" aria-label="Acca Crash introduction">
              <div className="acca-splash-title">
                <span>Acca</span>
                <span className="accent">Crash ↗</span>
              </div>
              <div className="acca-splash-badge">⚽ Both teams to score ⚽</div>
              <div className="acca-splash-preview">
                <strong>4.86x</strong>
                <div className="acca-splash-cards">
                  {splashCards.map((c) => (
                    <div key={c.id} className={`acca-card ${c.tier}`}>
                      <img
                        className="acca-card-flag"
                        src={assetUrl(`common/images/countryIcons/${c.nation}Icon.svg`)}
                        alt=""
                      />
                      <b>{c.name}</b>
                      <small>{c.club}</small>
                      <span>+{c.boost.toFixed(2)}x</span>
                    </div>
                  ))}
                </div>
              </div>
              <ul className="acca-splash-steps">
                <li>
                  <b>Fixtures land</b>
                  <span>Every leg gets a player card, dealt live before kick-off.</span>
                </li>
                <li>
                  <b>Watch it climb</b>
                  <span>Both teams score, the multiplier keeps rising. One clean sheet and it crashes.</span>
                </li>
                <li>
                  <b>Your player scores, boost</b>
                  <span>Bronze +0.10x · Silver +0.25x · Gold +0.50x</span>
                </li>
                <li>
                  <b>Cash out in time</b>
                  <span>Two bets per round. Bank one early, ride the other.</span>
                </li>
              </ul>
              <button className="pbf-btn" onClick={() => setSplash(false)}>
                Play now
              </button>
              <p className="pbf-footer-note">18+ · Take time to think · begambleaware.org</p>
            </div>
          )}
        </>
      }
      header={
        <>
          <GameHeader
            eyebrow="Playbook"
            title={
              <>
                Acca <em>Crash</em>
              </>
            }
            balance={balance}
            currency={currency}
          >
            <span className="pbf-pill info">BTTS</span>
            {phase === 'running' && <span className="pbf-pill live">Live</span>}
          </GameHeader>

          <div className="acca-history" aria-label="Previous crash points">
            {history.map((m, i) => (
              <span key={i} className={m < 2 ? 'low' : 'high'}>
                {m.toFixed(2)}x
              </span>
            ))}
          </div>
        </>
      }
      stage={
        <div className="acca-stagewrap">
          <CanvasFrame
            config={crashCurveConfig.canvas}
            fill
            innerRef={stageRef}
            className={`acca-stage ${phase ?? ''} ${live.crashed ? 'crashed' : ''}`}
          >
            <PixiStage
              critical
              scene={createScene}
              props={{
                points: live.points,
                multiplier: live.multiplier,
                crashed: live.crashed,
                waiting: countdown !== null,
                boost: goals.reduce((sum, g) => (g.mine ? sum + g.boost : sum), 0),
              }}
              onError={onSceneError}
              transparent
            />
            {countdown !== null && (
              <div className="acca-countdown">
                <span key={countdown} className="pbf-count-pop">
                  {countdown}
                </span>
                <small>Kick-off in</small>
              </div>
            )}
            {flash && (
              <div key={flash.id} className="acca-goal" aria-live="assertive">
                <i className="acca-strobe" />
                <i className="acca-rays" />
                <i className="acca-rays late" />
                <b className="acca-goal-banner">{flash.scorer} scores</b>
                <span className="acca-goal-boost">+{flash.boost.toFixed(2)}x</span>
              </div>
            )}
            {live.crashed && <i key={`crash-${round.id}`} className="accacrash-strobe" />}
          </CanvasFrame>
          <section key={round.id} className="acca-cards" aria-label="Your scorer cards">
            {round.cards.map((c, i) => {
              const scored = goals.some((g) => g.mine && g.scorer === c.name && g.boost > 0);
              return (
                <div key={c.id} className={`acca-card ${c.tier} deal-${i} ${scored ? 'scored' : ''}`}>
                  <img
                    className="acca-card-flag"
                    src={assetUrl(`common/images/countryIcons/${c.nation}Icon.svg`)}
                    alt=""
                  />
                  <b>{c.name}</b>
                  <small>{c.club}</small>
                  <span>{scored ? 'GOAL' : `+${c.boost.toFixed(2)}x`}</span>
                </div>
              );
            })}
          </section>
        </div>
      }
      controls={
        <>
          <section className="acca-panels">
            {PANELS.map((p) => {
              const bet = bets.find((b) => b.panel === p);
              const locked = !betting || !!bet;
              const value = phase === 'running' && bet?.status === 'placed' ? bet.stake * live.multiplier : 0;
              return (
                <div className="acca-panel pbf-card pbf-rise" style={{ animationDelay: `${p * 120}ms` }} key={p}>
                  <div className="acca-auto">
                    <label className="acca-switch">
                      <input
                        type="checkbox"
                        checked={panelAuto[p] !== null}
                        disabled={locked}
                        onChange={(e) => setAuto(p, e.target.checked ? autoOptions[1] : null)}
                      />
                      <span aria-hidden="true" />
                      Auto
                    </label>
                    {panelAuto[p] !== null && (
                      <select
                        aria-label={`Auto cash-out panel ${p + 1}`}
                        value={panelAuto[p] ?? ''}
                        disabled={locked}
                        onChange={(e) => setAuto(p, Number(e.target.value))}
                      >
                        {autoOptions.map((a) => (
                          <option key={a} value={a}>
                            {a}x
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                  <div className="acca-stepper">
                    <button type="button" aria-label="Lower stake" disabled={locked} onClick={() => stepStake(p, -1)}>
                      −
                    </button>
                    <b>{money(bet?.stake ?? panelStake[p])}</b>
                    <button type="button" aria-label="Raise stake" disabled={locked} onClick={() => stepStake(p, 1)}>
                      +
                    </button>
                  </div>
                  <StakeChips
                    stakes={stakes.slice(0, 4)}
                    value={panelStake[p]}
                    onChange={(s) => setStakeFor(p, s)}
                    currency={currency}
                    disabled={locked}
                    label={`Quick stake panel ${p + 1}`}
                  />
                  {betting && !bet && (
                    <button className="pbf-btn" disabled={busy} onClick={() => placeBetAction(p)}>
                      Bet {money(panelStake[p])}
                    </button>
                  )}
                  {betting && bet && (
                    <button className="pbf-btn secondary" disabled={busy} onClick={() => cancelBetAction(p)}>
                      Cancel
                    </button>
                  )}
                  {phase === 'running' && bet?.status === 'placed' && (
                    <button className="pbf-btn coin" onClick={() => doCashOut(p)}>
                      Cash out {money(value)}
                    </button>
                  )}
                  {bet?.status === 'cashed' && (
                    <p className="acca-result win">
                      Won {money(bet.payout)} at {bet.cashedAt!.toFixed(2)}x
                    </p>
                  )}
                  {bet?.status === 'lost' && <p className="acca-result lose">Lost {money(bet.stake)}</p>}
                  {!betting && !bet && (
                    <button className="pbf-btn" disabled>
                      Wait
                    </button>
                  )}
                </div>
              );
            })}
          </section>
          {message && <p className="acca-message">{message}</p>}
        </>
      }
      infoLabel="Boosts and other players"
      info={
        <>
          <div className={`acca-ticker ${latestGoal ? '' : 'empty'}`} aria-live="polite">
            {latestGoal
              ? `${latestGoal.minute}' ${latestGoal.scorer} (${latestGoal.club})${latestGoal.mine && latestGoal.boost > 0 ? `  +${latestGoal.boost.toFixed(2)}x BOOST` : ''}`
              : 'Goals from your scorer cards boost the multiplier'}
          </div>
          <div className="acca-tiers" aria-label="Boost per card rarity">
            <span className="bronze">Bronze +0.10x</span>
            <span className="silver">Silver +0.25x</span>
            <span className="gold">Gold +0.50x</span>
          </div>
          <section className="acca-crowd pbf-card" aria-label="Other players">
            <div className="acca-crowd-tabs" role="tablist">
              {(['all', 'previous', 'top'] as CrowdTab[]).map((t) => (
                <button key={t} role="tab" aria-selected={crowdTab === t} onClick={() => setCrowdTab(t)}>
                  {t === 'all' ? 'All bets' : t === 'previous' ? 'Previous' : 'Top'}
                </button>
              ))}
            </div>
            <div className="acca-crowd-summary">
              <span>
                {cashedCount}/{shownCrowd.length} cashed out
              </span>
              <b>{money(totalWon)} total won</b>
            </div>
            <div className="acca-crowd-rows">
              {crowdRows.map((b) => (
                <div key={b.id} className="acca-crowd-row">
                  <span>{b.name}</span>
                  <span>{money(b.stake)}</span>
                  <span>{b.cashedAt ? `${b.cashedAt.toFixed(2)}x` : b.lost ? '—' : ''}</span>
                  <span className={b.cashedAt ? 'win' : b.lost ? 'lose' : ''}>
                    {b.cashedAt ? money(b.payout) : b.lost ? 'Crashed' : ''}
                  </span>
                </div>
              ))}
              {crowdRows.length === 0 && <p className="hol-muted">Nothing here yet.</p>}
            </div>
          </section>
          <p className="pbf-footer-note">
            Mock backend: crash point, goals, cash-outs, balance and the other-players panel are simulated. 18+
          </p>
        </>
      }
    />
  );
}
