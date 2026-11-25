import { Graphics, type Ticker } from 'pixi.js';

import { colorOf } from 'core/pixi/buildView';
import { usePixiEffect } from 'core/pixi/usePixiEffect';

import { confettiConfig as cfg } from './confetti.config';

type Bit = { g: Graphics; vx: number; vy: number; spin: number };

/** One confetti burst per mount: mount it when a round is won, unmount it afterwards. Decoration only. */
export function WinConfetti() {
  return usePixiEffect<null>((ctx) => {
    const { app, root } = ctx;
    const { width, height } = cfg.piece;
    const bits: Bit[] = Array.from({ length: cfg.count }, (_, i) => {
      const g = new Graphics()
        .rect(-width / 2, -height / 2, width, height)
        .fill(colorOf(cfg.colors[i % cfg.colors.length]));
      g.visible = false; // placed and shown on the first tick with a real canvas size
      g.rotation = Math.random() * Math.PI;
      root.addChild(g);
      return {
        g,
        vx: (Math.random() - 0.5) * cfg.speed.spreadX,
        vy: -Math.random() * cfg.speed.maxUp - cfg.speed.minUp,
        spin: (Math.random() - 0.5) * cfg.spin,
      };
    });
    let launched = false;
    let age = 0;
    let originX = 0;
    let originY = 0;
    const tick = (t: Ticker) => {
      if (!launched) {
        // The canvas can still be 0x0 when the effect mounts (before the first resize): wait for a real size,
        // then start every piece from the current origin.
        const { width: w, height: h } = app.screen;
        if (!w || !h) return;
        launched = true;
        originX = w * cfg.origin.x;
        originY = h * cfg.origin.y;
        for (const b of bits) {
          b.g.position.set(originX, originY);
          b.g.visible = true;
        }
      }
      age += t.deltaMS;
      const k = t.deltaMS / 16.7;
      let alive = false;
      for (const b of bits) {
        b.vy += cfg.gravity * k;
        b.g.x += b.vx * k;
        b.g.y += b.vy * k;
        b.g.rotation += b.spin * k;
        b.g.alpha = Math.max(0, b.g.alpha - cfg.fade * k);
        if (b.g.alpha > 0) alive = true;
      }
      // every piece has faded out: stop ticking until the next burst (remounting) instead of running forever
      if (!alive) app.ticker.remove(tick);
    };
    // A resize right after launch (layout still settling) moves the origin: carry the young burst with it.
    const onResize = () => {
      const { width: w, height: h } = app.screen;
      if (!launched || age > cfg.reanchorMs || !w || !h) return;
      const dx = w * cfg.origin.x - originX;
      const dy = h * cfg.origin.y - originY;
      originX += dx;
      originY += dy;
      for (const b of bits) b.g.position.set(b.g.x + dx, b.g.y + dy);
    };
    app.renderer.on('resize', onResize);
    app.ticker.add(tick);
    ctx.track(() => {
      app.ticker.remove(tick);
      app.renderer.off('resize', onResize);
    });
  }, null);
}
