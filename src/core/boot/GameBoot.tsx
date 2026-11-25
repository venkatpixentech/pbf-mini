import { Component, type ComponentType, type ReactNode, useEffect, useState } from 'react';

import type { CoreInit, GameDefinition, GameScreenProps } from 'core/game/defineGame';
import { initI18n, setLanguage } from 'core/i18n';
import { useCoreT } from 'core/i18n/react';
import { AppShell } from 'core/ui/AppShell';

import { readLaunchParams } from './launchParams';
import { withTimeout } from './loadQueue';
import { markStartup, onCriticalScene } from './startup';
import { sessionFailureCode, startupErrorScreen } from './startupError';

// Fonts the first screen renders with (Pixi text is drawn with whatever font is loaded at that moment).
const FONTS = ['900 20px Degular', '700 20px Degular', '400 15px "Avenir Next"', '800 15px "Avenir Next"'];
const FONT_TIMEOUT_MS = 3000; // after this the game starts with the fallback font instead of waiting
const INIT_TIMEOUT_MS = 15000;
const ASSET_TIMEOUT_MS = 15000;
const SCENE_TIMEOUT_MS = 10000; // safety net if a Pixi game never reports its critical stage

/**
 * Catches an error thrown while rendering the game screen (or in its effects) and hands it to GameBoot, which
 * replaces the screen with the blocking error screen. Without it React unmounts everything and the player is left
 * with a blank page. Errors in event handlers and async code do not unmount the screen and are not caught here.
 * React itself logs the caught error to the console.
 */
class ScreenBoundary extends Component<{ onError: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onError();
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

/** A boot step failed: `code` picks the blocking error screen. */
class BootFailure extends Error {
  code: string;
  detail: unknown;
  constructor(code: string, cause?: unknown) {
    super(code);
    this.detail = cause;
    this.code = code;
  }
}

// One init request per api instance, even when React StrictMode runs the boot effect twice in development.
const inits = new WeakMap<object, Promise<unknown>>();
function initOnce<Init>(api: { init(): Promise<Init> }): Promise<Init> {
  if (!inits.has(api)) inits.set(api, api.init());
  return inits.get(api) as Promise<Init>;
}

type Screen<Api, Init> = ComponentType<GameScreenProps<Api, Init>>;
type State<Api, Init> =
  | { stage: 'loading' }
  | { stage: 'ready'; init: Init; Screen: Screen<Api, Init>; playable: boolean }
  | { stage: 'error'; code: string };

/**
 * PBF opening flow for one game. Everything the first screen needs starts at once and runs in parallel:
 * session init, critical fonts, the game screen code and (Pixi games) critical assets plus an early renderer
 * probe. The screen then mounts under the loading overlay; the overlay is removed once the first frame is
 * drawn (the critical Pixi stage for Pixi games), which is the `pbf:playable` mark. Init failures show a
 * blocking screen with reload, as PBF does. The boot never imports Pixi itself, so DOM games never load it.
 */
export function GameBoot<Api extends { init(): Promise<Init> }, Init extends CoreInit>({
  game,
}: {
  game: GameDefinition<Api, Init>;
}) {
  const [launch] = useState(readLaunchParams);
  const [api] = useState(() => game.createApi(launch));
  const [state, setState] = useState<State<Api, Init>>({ stage: 'loading' });
  const [progress, setProgress] = useState(0);
  const t = useCoreT();

  useEffect(() => {
    document.title = game.title;
    markStartup('bootstrap');
    let alive = true;
    const abort = new AbortController();
    const pixi = game.renderer === 'pixi';

    // Real progress: one unit per font, per critical asset and for the session; two for the screen code;
    // one for the first frame of a Pixi game (reported by the playable step below).
    const total = 1 + 1 + FONTS.length + 2 + game.preload.length + (pixi ? 1 : 0);
    const parts = new Map<string, number>();
    const report = (key: string, units: number) => {
      parts.set(key, units);
      if (alive) setProgress([...parts.values()].reduce((a, b) => a + b, 0) / total);
    };

    const session = withTimeout(initOnce(api), INIT_TIMEOUT_MS, 'session').then(
      (init) => {
        report('session', 1);
        markStartup('session');
        return init;
      },
      (error: unknown) => {
        throw new BootFailure(sessionFailureCode(error), error);
      },
    );

    // Language: from the launch parameter, loaded with the session. A failed or unknown language falls back to
    // English inside initI18n, so this never fails the boot.
    const language = initI18n(launch.language, { game: game.translations }).then(() => {
      report('i18n', 1);
      markStartup('i18n');
    });

    // Fonts never block for long and never fail the boot: on timeout or error the fallback font is used.
    const fonts = Promise.all(
      FONTS.map((font, i) =>
        withTimeout(document.fonts.load(font), FONT_TIMEOUT_MS, font)
          .catch((error: unknown) => console.warn(`[boot] font not ready, using fallback: ${font}`, error))
          .then(() => report(`font${i}`, 1)),
      ),
    ).then(() => markStartup('fonts'));

    const code = game.loadScreen().then(
      (Screen) => {
        report('code', 2);
        markStartup('code');
        return Screen;
      },
      (error: unknown) => {
        throw new BootFailure('ASSETS_FAILED', error);
      },
    );

    const assets = game.preload.length
      ? import('core/pixi/preload')
          .then((m) =>
            m.preloadStageAssets(game.preload, {
              timeoutMs: ASSET_TIMEOUT_MS,
              signal: abort.signal,
              onProgress: (done) => report('assets', done),
            }),
          )
          .then(
            () => markStartup('critical-assets'),
            (error: unknown) => {
              throw new BootFailure('ASSETS_FAILED', error);
            },
          )
      : Promise.resolve();

    // Pixi games: probe WebGL (and start the GPU process) now, while the network is busy, instead of at
    // stage creation. Never fails the boot: the stage handles a missing renderer itself.
    const warm = pixi
      ? setTimeout(() => {
          import('core/pixi/warmup')
            .then((m) => {
              m.warmRenderer();
              markStartup('renderer-warm');
            })
            .catch(() => {});
        }, 0)
      : undefined;

    Promise.all([session, code, assets, fonts, language]).then(
      ([init, Screen]) => {
        if (!alive) return;
        markStartup('critical');
        setState({ stage: 'ready', init, Screen, playable: false });
      },
      (error: unknown) => {
        if (!alive) return;
        document.documentElement.classList.add('pbf-decorated');
        setState({ stage: 'error', code: error instanceof BootFailure ? error.code : 'SESSION_INVALID' });
      },
    );
    // Operators change the language the way PBF passes it: in the URL (hash or query). No reload needed.
    const onHashChange = () => void setLanguage(readLaunchParams().language);
    window.addEventListener('hashchange', onHashChange);

    return () => {
      alive = false;
      abort.abort();
      clearTimeout(warm);
      window.removeEventListener('hashchange', onHashChange);
    };
  }, [api, game, launch.language]);

  // The screen is mounted (under the overlay). Remove the overlay once its first frame is on screen.
  const waiting = state.stage === 'ready' && !state.playable;
  useEffect(() => {
    if (!waiting) return;
    let alive = true;
    const done = () => {
      if (!alive) return;
      alive = false;
      setProgress(1);
      markStartup('playable');
      document.documentElement.classList.add('pbf-decorated'); // optional decoration loads only now
      setState((s) => (s.stage === 'ready' ? { ...s, playable: true } : s));
    };
    if (game.renderer === 'pixi') {
      // drawn or failed: either way the screen takes over (a failed stage shows the game's own fallback)
      const off = onCriticalScene(done);
      const safety = setTimeout(() => {
        console.warn('[boot] critical Pixi stage did not report; is a <PixiStage critical> on the first screen?');
        done();
      }, SCENE_TIMEOUT_MS);
      return () => {
        off();
        clearTimeout(safety);
        alive = false;
      };
    }
    // DOM game: the screen is committed; wait for the frame that paints it
    let raf = requestAnimationFrame(() => (raf = requestAnimationFrame(done)));
    return () => {
      cancelAnimationFrame(raf);
      alive = false;
    };
  }, [waiting, game]);

  // The screen crashed while rendering (before or after it became playable): show the runtime error screen.
  const onScreenError = () => {
    document.documentElement.classList.add('pbf-decorated');
    setState({ stage: 'error', code: 'RUNTIME' });
  };

  const Screen = state.stage === 'ready' ? state.Screen : null;
  const errorName = state.stage === 'error' ? startupErrorScreen(state.code) : null;
  return (
    <AppShell>
      {Screen && state.stage === 'ready' && (
        <ScreenBoundary onError={onScreenError}>
          <Screen api={api} init={state.init} launch={launch} />
        </ScreenBoundary>
      )}
      {(state.stage === 'loading' || waiting) && (
        <div className={waiting ? 'boot boot-overlay' : 'boot'} aria-busy="true">
          <h1 className="pbf-title">{game.title}</h1>
          <div className="boot-bar" role="progressbar" aria-valuenow={Math.round(progress * 100)}>
            <span style={{ transform: `scaleX(${progress})` }} />
          </div>
          <p className="pbf-caption">{t('common.loading', { percent: Math.round(progress * 100) })}</p>
        </div>
      )}
      {errorName && (
        <div className="boot" role="alert">
          <h1 className="pbf-title">{t(`common.boot.${errorName}.title`)}</h1>
          <p>{t(`common.boot.${errorName}.body`)}</p>
          <button className="pbf-btn" onClick={() => window.location.reload()}>
            {t('common.reload')}
          </button>
          {launch.lobbyUrl && (
            <a className="pbf-btn secondary" href={launch.lobbyUrl}>
              {t('common.lobby')}
            </a>
          )}
        </div>
      )}
    </AppShell>
  );
}
