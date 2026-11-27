import { Application } from 'pixi.js';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';

import { markStartup, reportCriticalScene } from 'core/boot/startup';
import { onLanguageChange } from 'core/i18n';

import { relabelTexts } from './buildView';
import type { AssetLease } from './AssetRegistry';
import type { PixiScene, SceneFactory, StageInput } from './scene';
import { acquireStageAssets } from './stageAssets';
import type { AssetDef, SpineAssetDef } from './viewConfig';
import type { SpineLease } from './wrapper/SpineAssets';
import { spineAssets } from './wrapper/SpineAssetBackend';
import { loadSpineRuntime } from './wrapper/SpineRuntime';

export type StageError = { kind: 'init' | 'assets' | 'scene' | 'context-lost'; error?: unknown };

/** How long a lost WebGL context may stay lost before the stage is rebuilt from scratch. */
const CONTEXT_RESTORE_TIMEOUT_MS = 3000;

type Props<P, E> = {
  scene: SceneFactory<P, E>;
  props: P;
  /**
   * Images, atlases, sequences, fonts and bitmap fonts the scene uses (the old `{ alias, src }` list is valid). The stage
   * loads them before the scene starts, holds them while mounted and releases them on unmount; stages that list the same
   * alias share one load. A failed load (after one retry) is reported as `StageError` kind `assets`.
   */
  assets?: AssetDef[];
  /**
   * Spine assets the scene uses (PixSpine.create). The stage loads them before the scene starts, holds them while
   * mounted and releases them on unmount; stages that list the same asset share one load. The Spine runtime itself
   * is fetched only when this is not empty.
   */
  spine?: SpineAssetDef[];
  onEvent?: (event: E) => void;
  onError?: (error: StageError) => void;
  /** After a `context-lost` error the stage is usable again: the context came back and was redrawn, or the stage was rebuilt. */
  onRecovered?: () => void;
  transparent?: boolean;
  paused?: boolean;
  className?: string;
  /**
   * The stage the first screen cannot be played without (one per game). GameBoot keeps its loading
   * overlay up until this stage has drawn its first frame, and records the renderer/scene/first-render marks.
   */
  critical?: boolean;
};

/**
 * Owns one Pixi Application per mount: create, attach, resize, pause, context loss, full teardown.
 * Nothing is shared between mounts (docs/04-RENDERING-REACT-PIXI.md). Teardown runs exactly once on every path:
 * normal unmount, unmount during async init (StrictMode), and init failure.
 */
export function PixiStage<P, E>({
  scene,
  props,
  assets = [],
  spine,
  onEvent,
  onError,
  onRecovered,
  transparent,
  paused,
  className,
  critical,
}: Props<P, E>) {
  const host = useRef<HTMLDivElement>(null);
  const live = useRef<{ app: Application; scene: PixiScene<P, E>; notifyBlocked: () => void } | null>(null);
  // Bumped to rebuild the Application when a lost context is not restored in time.
  const [generation, setGeneration] = useState(0);
  // Latest values without re-running the mount effect.
  const latest = useRef({ props, onEvent, onError, onRecovered, paused });
  useLayoutEffect(() => {
    latest.current = { props, onEvent, onError, onRecovered, paused };
  });

  useLayoutEffect(() => {
    const el = host.current!;
    const app = new Application();
    const instance = scene();
    const disposers: Array<() => void> = [];
    let cancelled = false;
    let done = false;
    let step: StageError['kind'] = 'init';
    const started = { app: false, scene: false };
    let assetLease: AssetLease | undefined;
    let spineLease: SpineLease | undefined;
    // Input is blocked for the same reasons the ticker stops: paused, hidden tab, lost context. Interaction bindings
    // subscribe (scene ctx.input) and cancel presses in progress when it turns true.
    let contextLost = false;
    let lastBlocked = false;
    const blockedListeners = new Set<(blocked: boolean) => void>();
    const isBlocked = () => !!latest.current.paused || document.hidden || contextLost;
    const notifyBlocked = () => {
      const blocked = isBlocked();
      if (blocked === lastBlocked) return;
      lastBlocked = blocked;
      for (const listener of [...blockedListeners]) listener(blocked);
    };
    const input: StageInput = {
      get blocked() {
        return isBlocked();
      },
      onBlockedChange(listener) {
        blockedListeners.add(listener);
        return () => blockedListeners.delete(listener);
      },
    };

    const teardown = () => {
      if (started.scene) instance.destroy();
      disposers.splice(0).forEach((dispose) => dispose());
      if (started.app) app.destroy({ removeView: true }, { children: true });
      assetLease?.release();
      spineLease?.release(); // after the Application is gone: no PixSpine is drawing from these textures any more
    };

    (async () => {
      try {
        if (spine?.length) {
          // Spine registers its render pipe with Pixi when it loads, and a renderer only picks up pipes registered
          // before the Application is created, so the runtime comes first (it is lazy: only stages with Spine do this).
          step = 'assets';
          await loadSpineRuntime();
          step = 'init';
        }
        await app.init({
          resizeTo: el,
          backgroundAlpha: transparent ? 0 : 1,
          resolution: Math.min(window.devicePixelRatio || 1, 2),
          autoDensity: true,
          antialias: true,
        });
        started.app = true;
        if (critical) markStartup('renderer');

        step = 'assets';
        assetLease = acquireStageAssets(assets); // references are taken now, so they are released in teardown even if loading fails
        if (spine?.length) spineLease = spineAssets.acquire(spine); // also taken now, released in teardown
        await Promise.all([assetLease.ready, spineLease?.ready]);
        if (cancelled) return;

        el.appendChild(app.canvas);
        const canvas = app.canvas;
        // Context loss: preventDefault lets the browser restore the context, Pixi rebuilds its GPU resources on
        // restore, and we redraw and resume. If it is not restored in time the whole stage is rebuilt.
        let restoreTimer: ReturnType<typeof setTimeout> | undefined;
        const onLost = (e: Event) => {
          e.preventDefault();
          app.ticker.stop();
          contextLost = true;
          notifyBlocked();
          latest.current.onError?.({ kind: 'context-lost' });
          clearTimeout(restoreTimer);
          restoreTimer = setTimeout(() => setGeneration((g) => g + 1), CONTEXT_RESTORE_TIMEOUT_MS);
        };
        const onRestored = () => {
          clearTimeout(restoreTimer);
          contextLost = false;
          instance.resize(app.screen.width, app.screen.height);
          app.render();
          if (!document.hidden && !latest.current.paused) app.ticker.start();
          notifyBlocked();
          latest.current.onRecovered?.();
        };
        canvas.addEventListener('webglcontextlost', onLost);
        canvas.addEventListener('webglcontextrestored', onRestored);
        disposers.push(() => {
          clearTimeout(restoreTimer);
          canvas.removeEventListener('webglcontextlost', onLost);
          canvas.removeEventListener('webglcontextrestored', onRestored);
        });

        const onResize = () => instance.resize(app.screen.width, app.screen.height);
        app.renderer.on('resize', onResize);
        disposers.push(() => app.renderer.off('resize', onResize));
        // Pixi's resizeTo follows window resizes only. The host box also changes without one (layout slot,
        // operator container, info panel growing), so watch the box itself. Same Application: no re-init.
        if (typeof ResizeObserver !== 'undefined') {
          const observer = new ResizeObserver(() => app.queueResize());
          observer.observe(el);
          disposers.push(() => observer.disconnect());
        }

        const onVisibility = () => {
          if (document.hidden || latest.current.paused) app.ticker.stop();
          else app.ticker.start();
          notifyBlocked();
        };
        document.addEventListener('visibilitychange', onVisibility);
        disposers.push(() => document.removeEventListener('visibilitychange', onVisibility));
        disposers.push(() => blockedListeners.clear());

        // a language switch relabels every translated text in the stage, in place
        disposers.push(onLanguageChange(() => relabelTexts(app.stage)));

        step = 'scene';
        started.scene = true;
        const initProps = latest.current.props;
        await instance.init(
          { app, root: app.stage, emit: (e) => latest.current.onEvent?.(e), track: (d) => disposers.push(d), input },
          initProps,
        );
        if (cancelled) return;
        // props that changed while the scene was starting were skipped by the update effect (live was not set)
        if (latest.current.props !== initProps) instance.update(latest.current.props);
        onResize();
        if (critical) {
          markStartup('scene');
          app.render(); // draw the first frame now rather than on the next tick, so readiness means drawn
          markStartup('first-render');
          reportCriticalScene(true);
        }
        if (latest.current.paused) app.ticker.stop();
        lastBlocked = isBlocked();
        live.current = { app, scene: instance, notifyBlocked };
        // A rebuilt stage (generation > 0) replaces a lost context that never came back: tell the screen it recovered.
        if (generation > 0) latest.current.onRecovered?.();
      } catch (error) {
        if (!cancelled) {
          if (critical) reportCriticalScene(false); // never leave the boot overlay up on a failed stage
          latest.current.onError?.({ kind: step, error });
        }
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
  }, [scene, generation]);

  useEffect(() => {
    live.current?.scene.update(props);
  }, [props]);

  useEffect(() => {
    const app = live.current?.app;
    if (!app) return;
    if (paused) app.ticker.stop();
    else app.ticker.start();
    live.current?.notifyBlocked();
  }, [paused]);

  return <div ref={host} className={className} style={{ width: '100%', height: '100%', position: 'relative' }} />;
}
