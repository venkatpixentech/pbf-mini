import './higherLower.css';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

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

import type { Card, HigherLowerApi, InitResponse, MarketId, ResultResponse, Run } from './api/types';
import { type FeedEvent, nextFeedEvent } from './feed';
import { useT } from './i18n';
import { FTUE_STEPS, hasFtueDone, hasSeenIntro, markFtueDone, markIntroSeen } from './ftue';
import { cardRevealConfig } from './scenes/cardReveal.config';
import { CARD_REVEAL_ASSETS, type CardRevealEvent, CardRevealScene } from './scenes/CardRevealScene';
import { WinConfetti } from './WinConfetti';

type Phase = 'betting' | 'locked' | 'reveal' | 'result';
// What is on screen. The SERVER owns the round: it opens and closes betting and settles by its own clock. These
// phases only follow it: 'betting' ends when server time reaches closesAt (display), 'locked' waits for the
// server's result, 'reveal' is the card animation, and 'result' lasts until the next round opens on the server.
const PHASES: Record<Phase, PhaseDef<Phase>> = {
  betting: { next: 'locked' },
  locked: { next: 'reveal' }, // advances when result() answers
  reveal: { next: 'result' }, // advances when the scene reports REVEAL_DONE
  result: { next: 'betting' }, // advances when the next round has opened (server time)
};
const RESULT_MIN_MS = 1600; // the result stays on screen at least this long
const isNetworkError = (e: unknown) => !(e instanceof ApiError);
const createScene = () => new CardRevealScene();

// backend error code -> translation key (INSUFFICIENT_BALANCE and INVALID_STAKE come from the shared core keys)
const ERROR_TEXT: Record<string, string> = {
  ROUND_CLOSED: 'hol.error.ROUND_CLOSED',
  ROUND_NOT_OPEN: 'hol.error.ROUND_NOT_OPEN',
  MARKET_UNAVAILABLE: 'hol.error.MARKET_UNAVAILABLE',
  NO_RUN: 'hol.error.NO_RUN',
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
  const [lastOutcome, setLastOutcome] = useState<ResultResponse['outcome']>('no-pick');
  const [feed, setFeed] = useState<FeedEvent[]>([]);
  // Splash shown once ever (localStorage, matching the prototype's `seen` flag); then a one-time
  // 4-step tutorial using the prototype's own coach copy, also shown only once ("ftueDone").
  const [introSeen, setIntroSeen] = useState(hasSeenIntro);
  const [ftueStep, setFtueStep] = useState<number | null>(null);
  const settled = useRef<ResultResponse | null>(null);
  const [resultReadyAt, setResultReadyAt] = useState<number | null>(null);
  // server clock (learned from every response) and duplicate-action protection
  const clock = useMemo(() => {
    const c = createServerClock();
    c.observeApprox(init.round.timing.serverTime);
    return c;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const guard = useMemo(() => createActionGuard(), []);
  const alive = useRef(true);
  useEffect(
    () => () => {
      alive.current = false;
    },
    [],
  );
  const { message, setMessage, fail } = useApiMessage(ERROR_TEXT);
  const t = useT();
  const money = (n: number) => formatMoney(n, currency);

  /**
   * Asks the server for the closed round's result. Settlement already happened on the server; the call is
   * idempotent, so it is safe to repeat. It retries while the server says the round is not closed yet (this
   * client's clock estimate was a little ahead) and after network errors, and keeps trying until it succeeds.
   */
  const fetchResult = (roundId: string) =>
    guard.run(`result:${roundId}`, async () => {
      for (let attempt = 1; alive.current; attempt++) {
        try {
          return await timed(
            clock,
            () => api.result(roundId),
            (r) => r.serverTime,
          );
        } catch (e) {
          const notClosedYet = e instanceof ApiError && e.code === 'ROUND_NOT_CLOSED';
          if (!notClosedYet && !isNetworkError(e)) throw e;
          if (attempt === 10 && !notClosedYet) fail(e); // tell the player, then keep trying
          await new Promise((resolve) => setTimeout(resolve, notClosedYet ? 150 : Math.min(3000, 300 * attempt)));
        }
      }
      throw new Error('left the screen');
    });

  const { engine, phase } = useRoundEngine(PHASES, 'betting', ({ to }, engine) => {
    if (to === 'locked') {
      fetchResult(round.id).then((s) => {
        settled.current = s;
        setCards((c) => ({ ...c, next: s.next }));
        setMessage(null);
        engine.advance();
      }, fail);
    }
    if (to === 'result' && settled.current) {
      const s = settled.current;
      setBalance(s.balance);
      setRun(s.run);
      setLastOutcome(s.outcome);
      setMessage(s.outcome === 'won' ? 'hol.msg.correct' : s.outcome === 'lost' ? 'hol.msg.wrong' : null);
      setResultReadyAt(Math.max(clock.now() + RESULT_MIN_MS, s.round.timing.opensAt));
    }
    if (to === 'betting' && settled.current) {
      const s = settled.current;
      settled.current = null;
      setResultReadyAt(null);
      setHistory((h) => [s.round.current, ...h].slice(0, 8));
      setRound(s.round);
      setCards({ current: s.round.current, next: null });
      setPick(null);
      setMessage(null);
      const open = s.round.markets.filter((m) => m.available).map((m) => m.id);
      setFeed((f) => [nextFeedEvent(s.round.current, open), ...f].slice(0, 4));
    }
  });

  // Display only: betting ends on screen when server time reaches closesAt (the server has already stopped
  // accepting picks), and the result gives way to the next round when it opens on the server.
  useAtServerTime(clock, phase === 'betting' ? round.timing.closesAt : null, () => {
    if (engine.phase === 'betting') engine.advance();
  });
  useAtServerTime(clock, phase === 'result' ? resultReadyAt : null, () => {
    if (engine.phase === 'result') engine.advance();
  });
  const { secondsLeft, progress } = useCountdown(clock, round.timing.opensAt, round.timing.closesAt);

  const onSceneEvent = useCallback(
    (e: CardRevealEvent) => {
      if (e.type === 'REVEAL_DONE' && engine.phase === 'reveal') engine.advance();
    },
    [engine],
  );
  const onSceneError = useCallback(
    (e: StageError) => setMessage('common.display.error', { kind: e.kind }),
    [setMessage],
  );

  const onSceneRecovered = useCallback(() => setMessage(null), [setMessage]);

  const betting = phase === 'betting';
  const choose = async (market: MarketId) => {
    if (busy || !betting) return;
    setBusy(true);
    try {
      // one request id per click, reused by every retry: the stake is never taken twice
      const r = await guard.run(`pick:${round.id}`, (id) =>
        retryWithSameKey(
          (requestId) =>
            timed(
              clock,
              () => api.pick(round.id, market, stake, requestId),
              (x) => x.serverTime,
            ),
          { shouldRetry: isNetworkError },
          id,
        ),
      );
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
      const r = await guard.run(`cashout:${round.id}`, (id) =>
        retryWithSameKey(
          (requestId) =>
            timed(
              clock,
              () => api.cashOut(requestId),
              (x) => x.serverTime,
            ),
          { shouldRetry: isNetworkError },
          id,
        ),
      );
      setBalance(r.balance);
      setRun(null);
      setPick(null);
      setMessage('hol.msg.cashedOut', { amount: money(r.amount) });
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
  const overlays = (
    <>
      {!introSeen && (
        <div className="hol-splash" role="dialog" aria-label={t('hol.intro.label')}>
          <span className="hol-splash-eyebrow">Playbook</span>
          <h2 className="hol-splash-title">
            {t('hol.splash.line1')}
            <br />
            {t('hol.splash.line2')}
          </h2>
          <p>{t('hol.splash.body')}</p>
          <div className="hol-splash-live">
            <span className="pbf-pill live">{t('hol.splash.live')}</span>
            <span>{t('hol.splash.player', { name: cards.current.name, ovr: cards.current.ovr })}</span>
          </div>
          <button className="pbf-btn" onClick={joinGame}>
            {t('hol.splash.join')}
          </button>
          <span className="pbf-footer-note">{t('hol.splash.note', { balance: money(init.balance) })}</span>
        </div>
      )}
      {introSeen && ftueStep !== null && (
        <div className="hol-ftue" role="dialog" aria-label={t('hol.ftue.label')}>
          <div className="hol-ftue-card">
            <span className="pbf-caption">{t('hol.ftue.step', { step: ftueStep + 1, total: FTUE_STEPS.length })}</span>
            <h3>{t(FTUE_STEPS[ftueStep].title)}</h3>
            <p>{t(FTUE_STEPS[ftueStep].body)}</p>
            <button className="pbf-btn" onClick={ftueNext}>
              {t(FTUE_STEPS[ftueStep].cta)}
            </button>
          </div>
        </div>
      )}
    </>
  );

  const header = (
    <>
      <GameHeader eyebrow="Playbook" title={t('hol.title')} balance={balance} currency={currency} />
      <section className="hol-banner pbf-card" aria-live="polite">
        <div>
          <h2>
            {t('hol.banner.lead')} <em>{cards.current.ovr}?</em>
          </h2>
          <p>
            {pickedMarket
              ? t('hol.banner.picked', { market: pickedMarket.label, price: pickedMarket.price.toFixed(2) })
              : phase === 'result'
                ? (message ?? t('hol.banner.next'))
                : phase === 'betting'
                  ? t('hol.banner.player', { position: cards.current.position, club: cards.current.club })
                  : t('hol.banner.revealing')}
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
    </>
  );

  const stage = (
    <CanvasFrame config={cardRevealConfig.canvas} fill className="hol-stage">
      <div className="hol-labels" aria-hidden="true">
        <span className="pbf-caption">{t('hol.label.current')}</span>
        <span className="pbf-caption next">{t('hol.label.next')}</span>
      </div>
      {phase === 'result' && lastOutcome !== 'no-pick' && (
        <b key={`stamp-${round.id}`} className={`hol-stamp ${lastOutcome}`}>
          {lastOutcome === 'won' ? t('hol.stamp.won') : t('hol.stamp.lost')}
        </b>
      )}
      {phase === 'result' && lastOutcome === 'won' && (
        <div className="hol-confetti" key={`confetti-${round.id}`}>
          <WinConfetti />
        </div>
      )}
      <PixiStage
        critical
        scene={createScene}
        props={cards}
        assets={CARD_REVEAL_ASSETS}
        onEvent={onSceneEvent}
        onError={onSceneError}
        onRecovered={onSceneRecovered}
        transparent
      />
    </CanvasFrame>
  );

  const controls = (
    <>
      {!run && (
        <section className="hol-stake" aria-label={t('common.stake')}>
          <StakeChips stakes={stakes} value={stake} onChange={setStake} currency={currency} disabled={!betting} />
        </section>
      )}
      {run && run.streak >= 1 && (
        <button className="pbf-btn coin hol-cash" disabled={!betting || busy} onClick={cashOut}>
          {run.streak === 1
            ? t('hol.cash.one', { amount: money(run.cashValue) })
            : t('hol.cash.many', { amount: money(run.cashValue), streak: run.streak })}
        </button>
      )}
      <section className="hol-markets" aria-label={t('hol.markets.label')}>
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
    </>
  );

  const info = (
    <>
      <section className="hol-last pbf-card" aria-label={t('hol.last.title')}>
        <span className="pbf-caption">{t('hol.last.title')}</span>
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
          {history.length === 0 && <span className="hol-muted">{t('hol.last.none')}</span>}
        </div>
      </section>

      <section className="hol-run pbf-card" aria-label={t('hol.run.label')}>
        <div className="hol-run-head">
          <span className="pbf-caption">
            {run ? t('hol.run.started', { streak: run.streak }) : t('hol.run.notStarted')}
          </span>
          <span className="pbf-caption">{t('hol.run.bonus')}</span>
        </div>
        <ol className="hol-ladder">
          {LADDER.map((n) => (
            <li key={n} className={run && run.streak >= n ? 'done' : run && run.streak + 1 === n ? 'next' : ''}>
              <b>{n}</b>
              {n >= 3 && <small>+{n === 3 ? 5 : n === 4 ? 10 : 15}%</small>}
            </li>
          ))}
        </ol>
      </section>

      <section className="hol-feed pbf-card" aria-label={t('hol.feed.title')}>
        <span className="pbf-caption">{t('hol.feed.title')}</span>
        {feed.length === 0 && <p className="hol-muted">{t('hol.feed.none')}</p>}
        {feed.map((e) => (
          <p key={e.id} className={e.win ? 'win' : 'lose'}>
            <b>{e.name}</b>{' '}
            {t(e.win ? 'hol.feed.cashed' : 'hol.feed.lost', {
              market: round.markets.find((m) => m.id === e.market)?.label ?? e.market,
              ovr: e.ovr,
            })}
          </p>
        ))}
      </section>

      <p className="pbf-footer-note">{t('hol.footer.mock')}</p>
    </>
  );

  return (
    <GameLayout
      className="hol"
      header={header}
      stage={stage}
      controls={controls}
      info={info}
      infoLabel={t('hol.info.label')}
      overlays={overlays}
    />
  );
}
