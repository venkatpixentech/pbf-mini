import type { ReactNode, Ref } from 'react';

import { type CanvasConfig, canvasHeight, validateCanvas } from './viewConfig';

type Props = {
  config: CanvasConfig;
  className?: string;
  /**
   * Fill the parent (a GameLayout stage slot) instead of taking the config's share of the screen height.
   * The layout then decides the canvas size; the config's `canvas` values are not used for height.
   */
  fill?: boolean;
  /** Overlays (React/CSS) go in as children and sit on top of the canvas. */
  children?: ReactNode;
  innerRef?: Ref<HTMLDivElement>;
};

/**
 * The canvas area of a game screen. Standalone, its size comes from the view config (`canvas`), so how much
 * of the screen the canvas takes is changed in one place; inside GameLayout use `fill`. Put <PixiStage> and
 * any overlays inside it.
 */
export function CanvasFrame({ config, className, fill, children, innerRef }: Props) {
  validateCanvas(config);
  const height = fill ? '100%' : canvasHeight(config);
  return (
    <div ref={innerRef} className={className} style={{ height, minHeight: 0, position: 'relative' }}>
      {children}
    </div>
  );
}
