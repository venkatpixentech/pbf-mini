import type { ReactNode, Ref } from 'react';

import { type CanvasConfig, canvasHeight, validateCanvas } from './viewConfig';

type Props = {
  config: CanvasConfig;
  className?: string;
  /** Overlays (React/CSS) go in as children and sit on top of the canvas. */
  children?: ReactNode;
  innerRef?: Ref<HTMLDivElement>;
};

/**
 * The canvas area of a game screen. Its size comes from the view config (`canvas`), not from CSS, so how much
 * of the screen the canvas takes is changed in one place. Put <PixiStage> and any overlays inside it.
 */
export function CanvasFrame({ config, className, children, innerRef }: Props) {
  validateCanvas(config);
  return (
    <div ref={innerRef} className={className} style={{ height: canvasHeight(config), position: 'relative' }}>
      {children}
    </div>
  );
}
