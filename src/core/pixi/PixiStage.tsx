import { Application } from 'pixi.js';
import { useEffect, useLayoutEffect, useRef } from 'react';

import type { PixiScene, SceneFactory, StageAsset } from './scene';
import { loadStageAssets, unloadStageAssets } from './stageAssets';

export type StageError = { kind: 'init' | 'assets' | 'scene' | 'context-lost'; error?: unknown };

type Props<P, E> = {
  scene: SceneFactory<P, E>;
  props: P;
  assets?: StageAsset[];
  onEvent?: (event: E) => void;
  onError?: (error: StageError) => void;
  transparent?: boolean;
  paused?: boolean;
  className?: string;
};

/**
 * Owns one Pixi Application per mount: create, attach, resize, pause, context loss, full teardown.
 * Nothing is shared between mounts (doc 03 A5.1). Teardown runs exactly once on every path:
 * normal unmount, unmount during async init (StrictMode), and init failure.
 */
export function PixiStage<P, E>({
  scene,
  props,
  assets = [],
  onEvent,
  onError,
  transparent,
  paused,
  className,
}: Props<P, E>) {
  const host = useRef<HTMLDivElement>(null);
  const live = useRef<{ app: Application; scene: PixiScene<P, E> } | null>(null);
  // Latest values without re-running the mount effect.
  const latest = useRef({ props, onEvent, onError, paused });
  useLayoutEffect(() => {
    latest.current = { props, onEvent, onError, paused };
  });

  useLayoutEffect(() => {
    const el = host.current!;
    const app = new Application();
    const instance = scene();
    const disposers: Array<() => void> = [];
    let cancelled = false;
    let done = false;
    let step: StageError['kind'] = 'init';
    const started = { app: false, assets: false, scene: false };

    const teardown = () => {
      if (started.scene) instance.destroy();
      disposers.splice(0).forEach((dispose) => dispose());
      if (started.app) app.destroy({ removeView: true }, { children: true });
      if (started.assets) void unloadStageAssets(assets);
    };

    (async () => {
      try {
        await app.init({
          resizeTo: el,
          backgroundAlpha: transparent ? 0 : 1,
          resolution: Math.min(window.devicePixelRatio || 1, 2),
          autoDensity: true,
          antialias: true,
        });
        started.app = true;

        step = 'assets';
        const loading = loadStageAssets(assets);
        started.assets = true; // ref counts are taken synchronously, so release them even if loading fails
        await loading;
        if (cancelled) return;

        el.appendChild(app.canvas);
        const canvas = app.canvas;
        const onLost = (e: Event) => {
          e.preventDefault();
          latest.current.onError?.({ kind: 'context-lost' });
        };
        canvas.addEventListener('webglcontextlost', onLost);
        disposers.push(() => canvas.removeEventListener('webglcontextlost', onLost));

        const onResize = () => instance.resize(app.screen.width, app.screen.height);
        app.renderer.on('resize', onResize);
        disposers.push(() => app.renderer.off('resize', onResize));

        const onVisibility = () => {
          if (document.hidden || latest.current.paused) app.ticker.stop();
          else app.ticker.start();
        };
        document.addEventListener('visibilitychange', onVisibility);
        disposers.push(() => document.removeEventListener('visibilitychange', onVisibility));

        step = 'scene';
        started.scene = true;
        await instance.init(
          { app, root: app.stage, emit: (e) => latest.current.onEvent?.(e), track: (d) => disposers.push(d) },
          latest.current.props,
        );
        if (cancelled) return;
        onResize();
        if (latest.current.paused) app.ticker.stop();
        live.current = { app, scene: instance };
      } catch (error) {
        if (!cancelled) latest.current.onError?.({ kind: step, error });
      } finally {
        done = true;
        if (cancelled) teardown();
      }
    })();

    return () => {
      cancelled = true;
      live.current = null;
      if (done) teardown(); // otherwise the finally block above tears down when init settles
    };
    // Rebuilt only when the scene factory changes; props flow through update().
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene]);

  useEffect(() => {
    live.current?.scene.update(props);
  }, [props]);

  useEffect(() => {
    const app = live.current?.app;
    if (!app) return;
    if (paused) app.ticker.stop();
    else app.ticker.start();
  }, [paused]);

  return <div ref={host} className={className} style={{ width: '100%', height: '100%', position: 'relative' }} />;
}
