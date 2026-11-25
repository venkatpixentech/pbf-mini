import type { ReactNode } from 'react';

type Props = {
  /** Game root class (e.g. 'hol'); game CSS hangs off it. */
  className?: string;
  /** Compact header row: title, balance, round status. Part of the playable unit. */
  header?: ReactNode;
  /** The game area (canvas or DOM). Takes all height the header and controls leave. */
  stage: ReactNode;
  /** Essential controls (stake, bet, cash out, picks). Never scrolls. */
  controls?: ReactNode;
  /** Rules, history, live feed, extra information. Scrolls on its own, below or beside the playable unit. */
  info?: ReactNode;
  infoLabel?: string;
  /** Dialogs (intro, tutorial) that cover the whole game. */
  overlays?: ReactNode;
};

/**
 * Shared compact layout. The playable unit (header + stage + controls) is sized from the game's own
 * container, not the window, so it works standalone and inside an operator iframe or element:
 *
 *   portrait   playable unit = min(container height, max(--pbf-play-min, --pbf-play-share % of it));
 *              info fills the rest and scrolls by itself. When the container is too short for both,
 *              the playable unit takes the full height and info is reached by scrolling below it.
 *   landscape  (short, wide containers) stage on the left at full height; header, controls and the
 *              scrolling info on the right.
 *
 * Games set --pbf-play-min / --pbf-play-share and lay out their own stage and controls inside the slots.
 * See styles.css "game layout" and docs/06-RESPONSIVE-GAME-LAYOUT.md.
 */
export function GameLayout({
  className,
  header,
  stage,
  controls,
  info,
  infoLabel = 'Game information',
  overlays,
}: Props) {
  return (
    <main className={`pbf-layout${className ? ` ${className}` : ''}`}>
      <section className="pbf-play">
        {header && <div className="pbf-play-head">{header}</div>}
        <div className="pbf-play-stage">{stage}</div>
        {controls && <div className="pbf-play-controls">{controls}</div>}
      </section>
      {info && (
        <section className="pbf-info" aria-label={infoLabel}>
          {info}
        </section>
      )}
      {overlays}
    </main>
  );
}
