import './higherLower.css';

import { useCallback, useRef, useState } from 'react';

import type { GameScreenProps } from 'core/game/defineGame';
import { useApiMessage } from 'core/hooks/useApiMessage';
import { useRoundEngine } from 'core/hooks/useRoundEngine';
import { CanvasFrame } from 'core/pixi/CanvasFrame';
import { PixiStage, type StageError } from 'core/pixi/PixiStage';
import { formatMoney } from 'core/services/money';
import type { PhaseDef } from 'core/services/RoundEngine';
import { GameHeader } from 'core/ui/GameHeader';
import { StakeChips } from 'core/ui/StakeChips';

import type { Card, HigherLowerApi, InitResponse, MarketId, Run, SettleResponse } from './api/types';
import { type FeedEvent, nextFeedEvent } from './feed';
import { FTUE_STEPS, hasFtueDone, hasSeenIntro, markFtueDone, markIntroSeen } from './ftue';
import { cardRevealConfig } from './scenes/cardReveal.config';
import { CARD_REVEAL_ASSETS, type CardRevealEvent, CardRevealScene } from './scenes/CardRevealScene';
import { WinConfetti } from './WinConfetti';

type Phase = 'betting' | 'locked' | 'reveal' | 'result';
const PHASES: Record<Phase, PhaseDef<Phase>> = {
  betting: { durationMs: 8000, next: 'locked' },
  locked: { next: 'reveal' }, // advances when settle() answers
  reveal: { next: 'result' }, // advances when the scene reports REVEAL_DONE
  result: { durationMs: 1600, next: 'betting' },
};
const createScene = () => new CardRevealScene();

const ERROR_TEXT: Record<string, string> = {
  ROUND_CLOSED: 'Betting has closed for this round.',
  INSUFFICIENT_BALANCE: 'Not enough balance for that stake.',
  MARKET_UNAVAILABLE: 'That market is not available.',
  INVALID_STAKE: 'That stake is not allowed.',
  NO_RUN: 'Nothing to cash out yet.',
};

/** Higher or Lower: React owns UI, state and API calls; Pixi only renders the card reveal. Booted by the core. */
export function HigherLowerScreen({ api, init }: GameScreenProps<HigherLowerApi, InitResponse>) {
  const { currency, stakes } = init;
  const [balance, setBalance] = useState(init.balance);
  const [stake, setStake] = useState(stakes[0]);
  const [round, setRound] = useState(init.round);
  const [cards, setCards] = useState<{ current: Card; next: Card | null }>({ current: init.round.current, next: null });
  const [pick, setPick] = useState<MarketId | null>(null);
  const [run, setRun] = useState<Run | null>(null);
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<Card[]>([]);
  const [lastOutcome, setLastOutcome] = useState<SettleResponse['outcome']>('no-pick');
  const [feed, setFeed] = useState<FeedEvent[]>([]);
  // Splash shown once ever (localStorage, matching the prototype's `seen` flag); then a one-time
  // 4-step tutorial using the prototype's own coach copy, also shown only once ("ftueDone").
  const [introSeen, setIntroSeen] = useState(hasSeenIntro);
  const [ftueStep, setFtueStep] = useState<number | null>(null);
  const settled = useRef<SettleResponse | null>(null);
  const { message, setMessage, fail } = useApiMessage(ERROR_TEXT);
  const money = (n: number) => formatMoney(n, currency);

  const { engine, phase, secondsLeft, progress } = useRoundEngine(PHASES, 'betting', ({ to }, engine) => {
    if (to === 'locked') {
      api.settle(round.id).then((s) => {
        settled.current = s;
        setCards((c) => ({ ...c, next: s.next }));
        engine.advance();
      }, fail);
    }
    if (to === 'result' && settled.current) {
      const s = settled.current;
      setBalance(s.balance);
      setRun(s.run);
      setLastOutcome(s.outcome);
      setMessage(s.outcome === 'won' ? 'Correct!' : s.outcome === 'lost' ? 'Wrong, run lost.' : null);
    }
    if (to === 'betting' && settled.current) {
      const s = settled.current;
      settled.current = null;
      setHistory((h) => [s.round.current, ...h].slice(0, 8));
      setRound(s.round);
      setCards({ current: s.round.current, next: null });
      setPick(null);
      setMessage(null);
      const open = s.round.markets.filter((m) => m.available).map((m) => m.id);
      setFeed((f) => [nextFeedEvent(s.round.current, open), ...f].slice(0, 4));
    }
  });

  const onSceneEvent = useCallback(
    (e: CardRevealEvent) => {
      if (e.type === 'REVEAL_DONE' && engine.phase === 'reveal') engine.advance();
    },
    [engine],
  );
  const onSceneError = useCallback((e: StageError) => setMessage(`Display error (${e.kind}).`), [setMessage]);

  const betting = phase === 'betting';
  const choose = async (market: MarketId) => {
    if (busy || !betting) return;
    setBusy(true);
    try {
      const r = await api.pick(round.id, market, stake);
      setPick(r.pick);
      setRun(r.run);
      setBalance(r.balance);
      setMessage(null);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };
  const cashOut = async () => {
    if (busy || !betting) return;
    setBusy(true);
    try {
      const r = await api.cashOut();
      setBalance(r.balance);
      setRun(null);
      setPick(null);
      setMessage(`Cashed out ${money(r.amount)}`);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  const joinGame = () => {
    markIntroSeen();
    setIntroSeen(true);
    if (!hasFtueDone()) setFtueStep(0);
  };
  const ftueNext = () => {
    if (ftueStep === null) return;
    if (ftueStep + 1 < FTUE_STEPS.length) setFtueStep(ftueStep + 1);
    else {
      markFtueDone();
      setFtueStep(null);
    }
  };

  const pickedMarket = round.markets.find((m) => m.id === pick);
  const LADDER = [1, 2, 3, 4, 5];
  return (
    <main className="hol pbf-screen">
      {!introSeen && (
        <div className="hol-splash" role="dialog" aria-label="Higher or Lower introduction">
          <span className="hol-splash-eyebrow">Playbook</span>
          <h2 className="hol-splash-title">
            Higher
            <br />
            or lower
          </h2>
          <p>Pick Higher or Lower. Build your streak. Cash out before you get one wrong.</p>
          <div className="hol-splash-live">
            <span className="pbf-pill live">Live</span>
            <span>
              {cards.current.name} · OVR {cards.current.ovr}
            </span>
          </div>
          <button className="pbf-btn" onClick={joinGame}>
            Join game
          </button>
          <span className="pbf-footer-note">
            Demo balance {money(init.balance)} · 18+ · Take time to think · begambleaware.org
          </span>
        </div>
      )}

      {introSeen && ftueStep !== null && (
        <div className="hol-ftue" role="dialog" aria-label="How to play">
          <div className="hol-ftue-card">
            <span className="pbf-caption">
              {ftueStep + 1} / {FTUE_STEPS.length}
            </span>
            <h3>{FTUE_STEPS[ftueStep].title}</h3>
            <p>{FTUE_STEPS[ftueStep].body}</p>
            <button className="pbf-btn" onClick={ftueNext}>
              {FTUE_STEPS[ftueStep].cta}
            </button>
          </div>
        </div>
      )}

      <GameHeader title="Higher or Lower" balance={balance} currency={currency} />

      <section className="hol-last pbf-card" aria-label="Last cards">
        <span className="pbf-caption">Last cards</span>
        <div>
          {history.slice(0, 5).map((c, i) => {
            const prev = history[i + 1];
            const delta = prev ? c.ovr - prev.ovr : 0;
            return (
              <span key={history.length - i} className="hol-last-card">
                <b>{c.ovr}</b>
                {prev && <i className={delta >= 0 ? 'up' : 'down'}>{delta >= 0 ? `+${delta}` : delta}</i>}
              </span>
            );
          })}
          {history.length === 0 && <span className="hol-muted">No cards yet</span>}
        </div>
      </section>

      <section className="hol-banner pbf-card" aria-live="polite">
        <div>
          <h2>
            Higher or lower than <em>{cards.current.ovr}?</em>
          </h2>
          <small className="pbf-caption">
            {cards.current.position} · {cards.current.club}
          </small>
          <p>
            {pickedMarket
              ? `You picked ${pickedMarket.label} at ${pickedMarket.price.toFixed(2)}x`
              : phase === 'result'
                ? (message ?? 'Next round...')
                : phase === 'betting'
                  ? 'No pick this round.'
                  : 'Revealing...'}
          </p>
        </div>
        <strong className="hol-count">
          {betting && (
            <span key={secondsLeft} className="pbf-count-pop">
              {secondsLeft}
            </span>
          )}
        </strong>
        <div className="hol-bar" style={{ transform: `scaleX(${betting ? progress : 0})` }} />
      </section>

      <section className="hol-run pbf-card" aria-label="Your run">
        <div className="hol-run-head">
          <span className="pbf-caption">Your run · {run ? `${run.streak} wins` : 'not started'}</span>
          <span className="pbf-caption">3 wins for +5%</span>
        </div>
        <ol className="hol-ladder">
          {LADDER.map((n) => (
            <li key={n} className={run && run.streak >= n ? 'done' : run && run.streak + 1 === n ? 'next' : ''}>
              <b>{n}</b>
              {n >= 3 && <small>+{n === 3 ? 5 : n === 4 ? 10 : 15}%</small>}
            </li>
          ))}
        </ol>
        {run && run.streak >= 1 && (
          <button className="pbf-btn coin hol-cash" disabled={!betting || busy} onClick={cashOut}>
            Cash out {money(run.cashValue)}
          </button>
        )}
      </section>

      <div className="hol-labels">
        <span className="pbf-caption">Current player</span>
        <span className="pbf-caption next">Next player</span>
      </div>
      <CanvasFrame config={cardRevealConfig.canvas} className="hol-stage">
        {phase === 'result' && lastOutcome !== 'no-pick' && (
          <b key={`stamp-${round.id}`} className={`hol-stamp ${lastOutcome}`}>
            {lastOutcome === 'won' ? 'Correct' : 'Lost'}
          </b>
        )}
        {phase === 'result' && lastOutcome === 'won' && (
          <div className="hol-confetti" key={`confetti-${round.id}`}>
            <WinConfetti />
          </div>
        )}
        <PixiStage
          scene={createScene}
          props={cards}
          assets={CARD_REVEAL_ASSETS}
          onEvent={onSceneEvent}
          onError={onSceneError}
          transparent
        />
      </CanvasFrame>

      {!run && (
        <section className="hol-stake" aria-label="Stake">
          <span className="pbf-caption">Stake</span>
          <StakeChips stakes={stakes} value={stake} onChange={setStake} currency={currency} disabled={!betting} />
        </section>
      )}

      <section className="hol-markets" aria-label="Markets">
        {round.markets.map((m) => (
          <button
            key={m.id}
            className={m.id[0] === 'H' ? 'up' : 'down'}
            aria-pressed={pick === m.id}
            disabled={!betting || busy || !m.available}
            onClick={() => choose(m.id)}
          >
            <span>{m.label}</span>
            <b>{m.available ? `${m.price.toFixed(2)}x` : '-'}</b>
          </button>
        ))}
      </section>

      {message && betting && <p className="hol-message">{message}</p>}

      <section className="hol-feed pbf-card" aria-label="Live feed">
        <span className="pbf-caption">Live feed</span>
        {feed.length === 0 && <p className="hol-muted">No activity yet.</p>}
        {feed.map((e) => (
          <p key={e.id} className={e.win ? 'win' : 'lose'}>
            <b>{e.name}</b> {e.text}
          </p>
        ))}
      </section>

      <p className="pbf-footer-note">Mock backend: outcomes, prices and balance are simulated. 18+</p>
    </main>
  );
}
