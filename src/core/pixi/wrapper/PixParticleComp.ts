// A particle burst (confetti and similar) drawn inside a stage that already exists: the pieces live in a layer on
// the stage's root, so an effect never needs a second Pixi Application or WebGL context. Decoration only.
import { Container, Graphics, type Ticker } from 'pixi.js';

import { colorOf } from '../buildView';
import { type BurstConfig, launchVelocity, type Piece, stepBurst } from './PixParticleStep';
import { trackGroup } from '../AnimationServiceProxy';
import type { StageHost } from '../scene';

export type { BurstConfig } from './PixParticleStep';

/**
 * Starts one burst on top of the stage's content. It ends when every piece has faded (config `fade`), when
 * `stop()` is called, or when the stage unmounts, and always removes its layer.
 */
export function startBurst(host: StageHost, cfg: BurstConfig): { stop(): void } {
  const { app, root } = host;
  const layer = new Container();
  layer.eventMode = 'none'; // never intercepts a tap meant for the scene below
  root.addChild(layer);
  const { width, height } = cfg.piece;
  const pieces: Piece[] = Array.from({ length: cfg.count }, (_, i) => {
    const g = new Graphics()
      .rect(-width / 2, -height / 2, width, height)
      .fill(colorOf(cfg.colors[i % cfg.colors.length]));
    g.visible = false; // placed and shown on the first tick with a real canvas size
    g.rotation = Math.random() * Math.PI;
    layer.addChild(g);
    return { g, ...launchVelocity(cfg, Math.random) };
  });

  let launched = false;
  let age = 0;
  let originX = 0;
  let originY = 0;
  let ended = false;
  const group = trackGroup(host.track);

  const end = () => {
    if (ended) return;
    ended = true;
    app.ticker.remove(tick);
    app.renderer.off('resize', onResize);
    group.delete(end);
    if (!layer.destroyed) layer.destroy({ children: true });
  };

  function tick(t: Ticker) {
    if (!launched) {
      // The canvas can still be 0x0 when the burst starts (before the first resize): wait for a real size,
      // then start every piece from the current origin.
      const { width: w, height: h } = app.screen;
      if (!w || !h) return;
      launched = true;
      originX = w * cfg.origin.x;
      originY = h * cfg.origin.y;
      for (const p of pieces) {
        (p.g as Graphics).position.set(originX, originY);
        (p.g as Graphics).visible = true;
      }
    }
    age += t.deltaMS;
    // every piece has faded out: remove the layer instead of ticking forever
    if (!stepBurst(pieces, t.deltaMS, cfg)) end();
  }

  // A resize right after launch (layout still settling) moves the origin: carry the young burst with it.
  function onResize() {
    const { width: w, height: h } = app.screen;
    if (!launched || age > cfg.reanchorMs || !w || !h) return;
    const dx = w * cfg.origin.x - originX;
    const dy = h * cfg.origin.y - originY;
    originX += dx;
    originY += dy;
    for (const p of pieces) {
      p.g.x += dx;
      p.g.y += dy;
    }
  }

  app.renderer.on('resize', onResize);
  app.ticker.add(tick);
  group.add(end);
  return { stop: end };
}
