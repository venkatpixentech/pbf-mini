import { type ReactElement, useLayoutEffect, useMemo, useRef } from 'react';

import { PixiStage } from './PixiStage';
import type { SceneContext, SceneFactory } from './scene';

type Options = { transparent?: boolean; paused?: boolean; className?: string };

/**
 * Quickest way to add a small Pixi effect (confetti, glow, particles) without a scene class.
 * `draw` runs once when Pixi is ready; return a function to receive later prop changes.
 * Register tickers and listeners with ctx.track(() => ...) so they are removed on unmount.
 * Returns an element: place it in any sized parent. For anything with events or assets,
 * write a typed PixiScene and use <PixiStage> directly.
 */
export function usePixiEffect<P>(
  draw: (ctx: SceneContext<never>, props: P) => void | ((props: P) => void),
  props: P,
  { transparent = true, paused, className }: Options = {},
): ReactElement {
  const drawRef = useRef(draw);
  useLayoutEffect(() => {
    drawRef.current = draw;
  });
  const scene = useMemo<SceneFactory<P, never>>(
    () => () => {
      let onUpdate: void | ((props: P) => void);
      return {
        init: (ctx, p) => {
          onUpdate = drawRef.current(ctx, p);
        },
        update: (p) => onUpdate?.(p),
        resize: () => {},
        destroy: () => {},
      };
    },
    [],
  );
  return <PixiStage scene={scene} props={props} transparent={transparent} paused={paused} className={className} />;
}
