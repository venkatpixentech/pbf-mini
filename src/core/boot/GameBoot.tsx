import { Assets } from 'pixi.js';
import { useEffect, useState } from 'react';
import type { CoreInit, GameDefinition } from 'core/game/defineGame';
import { ApiError } from 'core/services/apiError';
import { AppShell } from 'core/ui/AppShell';

import { readLaunchParams } from './launchParams';

const ASSETS_ROOT = `${import.meta.env.BASE_URL}assets/`;
const FONTS = ['900 20px Degular', '700 20px Degular', '400 15px "Avenir Next"', '800 15px "Avenir Next"'];

const BOOT_ERRORS: Record<string, { title: string; body: string }> = {
  MAINTENANCE: { title: 'Under maintenance', body: 'The game is unavailable right now. Please try again later.' },
  SESSION_EXPIRED: { title: 'Session expired', body: 'Your session has ended. Please reload the game.' },
  SESSION_INVALID: { title: 'Unable to start', body: 'We could not start your session. Please reload the game.' },
};

type State<Init> =
  { stage: 'loading'; progress: number } | { stage: 'ready'; init: Init } | { stage: 'error'; code: string };

/**
 * PBF opening flow for one game: launch params -> preloader (fonts, game assets and session init in parallel,
 * with progress) -> the game screen. Init failures show a blocking screen with reload, as PBF does.
 */
export function GameBoot<Api extends { init(): Promise<Init> }, Init extends CoreInit>({
  game,
}: {
  game: GameDefinition<Api, Init>;
}) {
  const [launch] = useState(readLaunchParams);
  const [api] = useState(() => game.createApi(launch));
  const [state, setState] = useState<State<Init>>({ stage: 'loading', progress: 0 });

  useEffect(() => {
    document.title = game.title;
    let alive = true;
    let done = 0;
    const track = <T,>(p: Promise<T>) =>
      p.then((v) => {
        done += 1;
        if (alive) setState((s) => (s.stage === 'loading' ? { stage: 'loading', progress: done / total } : s));
        return v;
      });
    for (const a of game.preload)
      if (!Assets.resolver.hasKey(a.alias)) Assets.add({ alias: a.alias, src: ASSETS_ROOT + a.src });
    const jobs = [
      track(Promise.all(FONTS.map((f) => document.fonts.load(f)))),
      track<unknown>(game.preload.length ? Assets.load(game.preload.map((a) => a.alias)) : Promise.resolve()),
      track(api.init()),
    ] as const;
    const total = jobs.length;
    Promise.all(jobs).then(
      ([, , init]) => alive && setState({ stage: 'ready', init }),
      (error: unknown) =>
        alive && setState({ stage: 'error', code: error instanceof ApiError ? error.code : 'SESSION_INVALID' }),
    );
    return () => {
      alive = false;
    };
  }, [api, game]);

  return (
    <AppShell>
      {state.stage === 'ready' && <game.Screen api={api} init={state.init} launch={launch} />}
      {state.stage === 'loading' && (
        <div className="boot" aria-busy="true">
          <h1 className="pbf-title">{game.title}</h1>
          <div className="boot-bar" role="progressbar" aria-valuenow={Math.round(state.progress * 100)}>
            <span style={{ transform: `scaleX(${state.progress})` }} />
          </div>
          <p className="pbf-caption">Loading {Math.round(state.progress * 100)}%</p>
        </div>
      )}
      {state.stage === 'error' && (
        <div className="boot" role="alert">
          <h1 className="pbf-title">{(BOOT_ERRORS[state.code] ?? BOOT_ERRORS.SESSION_INVALID).title}</h1>
          <p>{(BOOT_ERRORS[state.code] ?? BOOT_ERRORS.SESSION_INVALID).body}</p>
          <button className="pbf-btn" onClick={() => window.location.reload()}>
            Reload
          </button>
          {launch.lobbyUrl && (
            <a className="pbf-btn secondary" href={launch.lobbyUrl}>
              Lobby
            </a>
          )}
        </div>
      )}
    </AppShell>
  );
}
