// The display harness scene: builds the config's elements, lays them out in the design size with layout.ts and hands a
// controller to the page so the browser tests can read what was drawn. A scene with no assets draws nothing but a marker.
// The `tap` kind binds interactive squares (UIUtil.bindInteractions) and reports their events to the page, which passes
// them to React the way a game's screen would.
import { type Application, Container, Graphics, type Rectangle } from 'pixi.js';

import { buildElements } from 'core/pixi/buildView';
import type { SceneInteraction } from 'core/pixi/InteractionStep';
import { applyPlacement, stageFit } from 'core/pixi/layout';
import type { PixiScene, SceneContext } from 'core/pixi/scene';
import { showFpsMeter } from 'core/pixi/FPSMeterView';
import { type InteractionBinding, UIUtil } from 'core/pixi/UIUtilService';
import { PixDynamicSprite, type DynamicSpriteOptions } from 'core/pixi/wrapper/PixDynamicSprite';
import { ScrollBox } from 'core/pixi/wrapper/ScrollBox';

import { elements, game, type Kind, tapElements } from '../config/game.config';

export type ProbeProps = { kind: Kind; /** Targets React has disabled. */ disabled?: string[] };

export type ProbeController = {
  app: Application;
  /** The container holding the design-size layout. */
  root: Container;
  /** What the stage size was the last time the scene laid out. */
  layouts: Array<{ width: number; height: number }>;
  painted(): number;
  /** The interaction binding of a `tap` scene. */
  binding?: InteractionBinding;
  /** A target's rectangle in page (client) coordinates: its hit area, or its drawn bounds. */
  rectOf(target: string, which: 'hit' | 'drawn'): { x: number; y: number; width: number; height: number } | null;
  /** The labelled object, for tests that remove or destroy it. */
  object(target: string): Container | null;
  /** The `strip` scene's scroll view. */
  strip?: ScrollBox;
  /** Makes a remote sprite (the `remote` scene) at a slot; the test drives showImage, updateImage and destroy on it. */
  makeSprite(name: string, options?: DynamicSpriteOptions): PixDynamicSprite;
  sprite(name: string): PixDynamicSprite | undefined;
  /** The FPS meter, when the page asked for one (dev builds only). */
  fps: { text: string; destroyed: boolean } | null;
  /** How many callbacks the stage's ticker holds. */
  tickerCount(): number;
};

export type ProbeEvent =
  { type: 'ready'; controller: ProbeController } | { type: 'interaction'; event: SceneInteraction };

export class DisplayProbeScene implements PixiScene<ProbeProps, ProbeEvent> {
  private root = new Container();
  private layouts: Array<{ width: number; height: number }> = [];
  private binding: InteractionBinding | undefined;
  private known: string[] = [];
  private sprites = new Map<string, PixDynamicSprite>();

  init(ctx: SceneContext<ProbeEvent>, props: ProbeProps) {
    if (props.kind === 'cards') this.root.addChild(buildElements(elements));
    else if (props.kind === 'seq')
      this.root.addChild(buildElements(elements.filter((e) => e.id === 'badge' || e.id === 'frame')));
    else if (props.kind === 'tap') {
      const frame = new Graphics()
        .rect(0, 0, game.design.width, game.design.height)
        .stroke({ width: 4, color: 0xffffff });
      this.root.addChild(frame, buildElements(tapElements));
    } else this.root.addChild(new Graphics().rect(0, 0, game.design.width, game.design.height).fill(0x3366ff));
    let strip: ScrollBox | undefined;
    if (props.kind === 'strip' || props.kind === 'remote') {
      this.root.addChild(new Graphics().rect(0, 0, game.design.width, game.design.height).fill(0x223344));
    }
    ctx.root.addChild(this.root);
    if (props.kind === 'strip') {
      this.binding = UIUtil.bindInteractions(ctx, this.root, [], (event) => ctx.emit({ type: 'interaction', event }));
      strip = new ScrollBox({
        width: 600,
        height: 200,
        type: 'horizontal',
        background: 0x000000,
        elementsMargin: 10,
        padding: 10,
        ticker: ctx.app.ticker,
        isBlocked: () => ctx.input.blocked,
      });
      strip.label = 'strip';
      strip.x = 60;
      strip.y = 300;
      this.root.addChild(strip);
      for (let i = 0; i < 12; i++) {
        const card = new Container();
        card.label = `card-${i}`;
        card.addChild(new Graphics().rect(0, 0, 120, 160).fill(i % 2 ? 0xff8844 : 0x44aaff));
        strip.addItems([card]);
        this.binding.add(`card-${i}`, card, { minTarget: 0 });
      }
      const binding = this.binding;
      strip.onDragClaim.connect((id) => binding.cancelPointer(id, 'claimed'));
      ctx.track(() => strip?.destroy({ children: true }));
      this.known = binding.targets();
    }
    if (props.kind === 'tap') {
      this.binding = UIUtil.bindInteractions(ctx, this.root, tapElements, (event) =>
        ctx.emit({ type: 'interaction', event }),
      );
      this.known = this.binding.targets();
      this.update(props);
    }
    const root = this.root;
    const binding = this.binding;
    const sprites = this.sprites;
    const meter = showFpsMeter(ctx.app.ticker);
    if (meter) {
      ctx.root.addChild(meter);
      ctx.track(() => meter.destroy());
    }
    const canvas = ctx.app.canvas;
    const controller: ProbeController = {
      app: ctx.app,
      root,
      layouts: this.layouts,
      binding,
      strip,
      fps: meter,
      tickerCount: () => ctx.app.ticker.count,
      makeSprite(name, options) {
        sprites.get(name)?.destroy();
        const sprite = new PixDynamicSprite(options);
        sprite.x = 100 + sprites.size * 160;
        sprite.y = 200;
        root.addChild(sprite);
        sprites.set(name, sprite);
        return sprite;
      },
      sprite: (name) => sprites.get(name),
      painted() {
        ctx.app.render();
        const { pixels } = ctx.app.renderer.extract.pixels(ctx.app.stage);
        let n = 0;
        for (let i = 3; i < pixels.length; i += 4) if (pixels[i] > 8) n++;
        return n;
      },
      object: (target) => root.getChildByLabel(target, true),
      rectOf(target, which) {
        const object = root.getChildByLabel(target, true);
        if (!object) return null;
        const offset = canvas.getBoundingClientRect();
        const hit = object.hitArea as Rectangle | null;
        const local =
          which === 'hit' && hit
            ? { x: hit.x, y: hit.y, width: hit.width, height: hit.height }
            : object.getLocalBounds();
        const a = object.toGlobal({ x: local.x, y: local.y });
        const b = object.toGlobal({ x: local.x + local.width, y: local.y + local.height });
        return { x: offset.left + a.x, y: offset.top + a.y, width: b.x - a.x, height: b.y - a.y };
      },
    };
    ctx.emit({ type: 'ready', controller });
  }

  update(props: ProbeProps) {
    if (!this.binding) return;
    const disabled = new Set(props.disabled ?? ['off']);
    for (const target of this.known) this.binding.setEnabled(target, !disabled.has(target));
  }

  resize(width: number, height: number) {
    this.layouts.push({ width, height });
    applyPlacement(this.root, stageFit(game.design, { width, height }, game.design.fit));
    this.binding?.refresh();
  }

  destroy() {
    this.sprites.forEach((s) => s.destroy());
    this.sprites.clear();
  }
}
