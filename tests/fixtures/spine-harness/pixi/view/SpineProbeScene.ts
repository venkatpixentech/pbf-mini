// The harness scene: builds PixSpine instances from the config and hands a controller to the page, so the browser
// tests can drive playback and read state. A scene with no view draws a plain rectangle (a stage without Spine).
import { type Application, Graphics } from 'pixi.js';

import type { PixiScene, SceneContext } from 'core/pixi/scene';
import { PixSpine } from 'core/pixi/wrapper/PixSpine';

import { spineViews, STAGE_SIZE, type ViewName } from '../config/spineProbe.config';

export type ProbeProps = { view: ViewName | null };

export type ProbeController = {
  app: Application;
  instances: Map<string, PixSpine>;
  spawn(name: string, view: ViewName): Promise<PixSpine>;
  drop(name: string): void;
  /** Number of visibly painted pixels in the stage (a real read-back of what the GPU drew). */
  painted(): number;
};

export type ProbeEvent = { type: 'ready'; controller: ProbeController };

export class SpineProbeScene implements PixiScene<ProbeProps, ProbeEvent> {
  async init(ctx: SceneContext<ProbeEvent>, props: ProbeProps) {
    const instances = new Map<string, PixSpine>();
    const controller: ProbeController = {
      app: ctx.app,
      instances,
      async spawn(name, view) {
        const spine = await PixSpine.create(ctx, spineViews[view]);
        ctx.root.addChild(spine);
        instances.set(name, spine);
        return spine;
      },
      drop(name) {
        instances.get(name)?.destroy();
        instances.delete(name);
      },
      painted() {
        ctx.app.render();
        const { pixels } = ctx.app.renderer.extract.pixels(ctx.app.stage);
        let n = 0;
        for (let i = 3; i < pixels.length; i += 4) if (pixels[i] > 8) n++;
        return n;
      },
    };
    if (props.view) await controller.spawn('main', props.view);
    else ctx.root.addChild(new Graphics().rect(20, 20, STAGE_SIZE - 40, STAGE_SIZE - 40).fill(0x3366ff));
    ctx.emit({ type: 'ready', controller });
  }

  update() {}

  resize() {}

  destroy() {}
}
