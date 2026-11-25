import './lastmanstanding.css';

import { useEffect, useState } from 'react';

import type { GameScreenProps } from 'core/game/defineGame';
import { useApiMessage } from 'core/hooks/useApiMessage';
import { GameHeader } from 'core/ui/GameHeader';
import { resetLayoutScroll } from 'core/ui/layoutScroll';

import type { CashOutResponse, Game, InitResponse, LastManStandingApi, PickResponse } from './api/types';
import { Banked, Match } from './screens/Match';
import { Play } from './screens/Play';
import { Setup } from './screens/Setup';

const ERROR_TEXT: Record<string, string> = {
  INSUFFICIENT_BALANCE: 'Not enough balance for that stake.',
  INVALID_STAKE: 'That stake is not allowed.',
  INVALID_LEAGUE: 'That league is not available.',
  INVALID_MODE: 'That difficulty is not available.',
  GAME_ACTIVE: 'You already have a game running.',
  NO_GAME: 'That game is no longer running. Start a new one.',
  GAME_OVER: 'That game is over. Start a new one.',
  UNKNOWN_TEAM: 'That team is not in this league.',
  TEAM_USED: 'You have already used that team.',
  CANNOT_CASH_OUT: 'You can cash out after round 1.',
};

type View =
  | { name: 'setup' }
  | { name: 'play' }
  | { name: 'match'; res: PickResponse }
  | { name: 'banked'; res: CashOutResponse };

/** Last Man Standing: pick one winner per game week, each team once, climb the prize ladder. */
export function LastManStandingScreen({ api, init }: GameScreenProps<LastManStandingApi, InitResponse>) {
  const { currency, stakes, leagues, modes } = init;
  const [balance, setBalance] = useState(init.balance);
  const [game, setGame] = useState<Game | null>(null);
  const [view, setView] = useState<View>({ name: 'setup' });
  const [stake, setStake] = useState(stakes[Math.min(2, stakes.length - 1)]);
  const [league, setLeague] = useState(leagues[0].id);
  const [mode, setMode] = useState(modes[1]?.id ?? modes[0].id);
  const [busy, setBusy] = useState(false);
  const { message, setMessage, fail } = useApiMessage(ERROR_TEXT);

  // a new view starts at the top of each scrolling part of the layout (page, stage, info)
  const viewKey = view.name === 'match' ? `match${view.res.game.history.length}` : `${view.name}${game?.gw ?? ''}`;
  useEffect(() => {
    resetLayoutScroll();
  }, [viewKey]);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setMessage(null);
    try {
      await fn();
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  const start = () =>
    run(async () => {
      const r = await api.start(league, mode, stake);
      setBalance(r.balance);
      setGame(r.game);
      setView({ name: 'play' });
    });

  const play = (code: string) =>
    run(async () => {
      if (!game) return;
      const r = await api.pick(game.id, code);
      setBalance(r.balance);
      setGame(r.game);
      setView({ name: 'match', res: r });
    });

  const cashOut = () =>
    run(async () => {
      if (!game) return;
      const r = await api.cashOut(game.id);
      setBalance(r.balance);
      setGame(r.game);
      setView({ name: 'banked', res: r });
    });

  const resetBalance = () =>
    run(async () => {
      const r = await api.resetDemoBalance();
      setBalance(r.balance);
    });

  const newGame = () => {
    setGame(null);
    setView({ name: 'setup' });
  };

  const frame = {
    header: <GameHeader eyebrow="Playbook" title="Last Man Standing" balance={balance} currency={currency} />,
    notice: message && (
      <p className="pbf-footer-note lms-notice" role="alert">
        {message}
      </p>
    ),
    footer: <p className="pbf-footer-note">Mock backend: results, prizes and balance are simulated. 18+</p>,
  };

  if (view.name === 'play' && game)
    return (
      <Play key={game.gw} game={game} currency={currency} busy={busy} onPlay={play} onCashOut={cashOut} frame={frame} />
    );
  if (view.name === 'match')
    return (
      <Match
        key={view.res.game.gw + view.res.game.history.length}
        res={view.res}
        currency={currency}
        busy={busy}
        onNext={() => setView({ name: 'play' })}
        onCashOut={cashOut}
        onNew={newGame}
        frame={frame}
      />
    );
  if (view.name === 'banked' && game)
    return <Banked res={view.res} currency={currency} stake={game.stake} onNew={newGame} frame={frame} />;
  return (
    <Setup
      init={init}
      balance={balance}
      stake={stake}
      league={league}
      mode={mode}
      busy={busy}
      onStake={setStake}
      onLeague={setLeague}
      onMode={setMode}
      onStart={start}
      onResetBalance={resetBalance}
      frame={frame}
    />
  );
}
