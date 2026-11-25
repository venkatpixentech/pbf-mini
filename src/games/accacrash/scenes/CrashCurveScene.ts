import { Container, Graphics, type Text, type Ticker } from 'pixi.js';

import { buildElements, colorOf } from 'core/pixi/buildView';
import type { PixiScene, SceneContext } from 'core/pixi/scene';

import { crashCurveConfig } from './crashCurve.config';

export type CrashCurveProps = {
  /** [elapsedMs, multiplier] samples from the server, oldest first. Empty while betting. */
  points: Array<[number, number]>;
  multiplier: number;
  crashed: boolean;
  /** True while betting: the React overlay shows the countdown, so the scene hides its labels. */
  waiting: boolean;
  /** Total boost added by your scorer cards this run (shown top right). */
  boost: number;
};
export type CrashCurveEvent = never;

const { plot, colors, pulse, texts, elements } = crashCurveConfig;

/** Rising multiplier curve with a filled area and a pulsing head; goal and crash overlays are React/CSS. */
export class CrashCurveScene implements PixiScene<CrashCurveProps, CrashCurveEvent> {
  private grid = new Graphics();
  private area = new Graphics();
  private curve = new Graphics();
  private head = new Graphics();
  private labels = buildElements(elements);
  private label = this.labels.getChildByLabel('label') as Text;
  private sub = this.labels.getChildByLabel('sub') as Text;
  private boostLabel = this.labels.getChildByLabel('boost') as Text;
  private props!: CrashCurveProps;
  private width = 0;
  private height = 0;
  private pulse = 0;
  // last values written to the labels: Pixi re-renders a text when its style is set, even to the same value
  private shownFill = -1;
  private shownSubFill = -1;
  private boostInset = elements.find((e) => e.id === 'boost')?.x ?? 0;

  init(ctx: SceneContext<CrashCurveEvent>, props: CrashCurveProps) {
    const layer = new Container();
    layer.addChild(this.grid, this.area, this.curve, this.head, this.labels);
    ctx.root.addChild(layer);
    // The head dot breathes while the run is live (gameplay motion, so it lives in the scene).
    const tick = (t: Ticker) => {
      this.pulse += t.deltaMS;
      const live = this.props && !this.props.crashed && this.props.points.length > 1;
      this.head.scale.set(live ? 1 + pulse.amount * Math.abs(Math.sin(this.pulse / pulse.periodMs)) : 1);
    };
    ctx.app.ticker.add(tick);
    ctx.track(() => ctx.app.ticker.remove(tick));
    this.update(props);
  }

  update(props: CrashCurveProps) {
    this.props = props;
    this.draw();
  }

  resize(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.draw();
  }

  destroy() {
    // display objects go with the stage; the ticker callback is removed through ctx.track
  }

  private draw() {
    const { width: w, height: h, props } = this;
    if (!w || !h || !props) return;
    const { points, multiplier, crashed, waiting } = props;
    const color = colorOf(crashed ? colors.crashed : colors.live);
    const pad = plot.pad;

    // scale: x grows with time, y with the multiplier (minimums come from the config)
    const maxT = Math.max(plot.minTimeMs, points.length ? points[points.length - 1][0] : 0);
    const maxM = Math.max(plot.minMultiplier, multiplier * plot.headroom);
    const x = (t: number) => pad + (t / maxT) * (w - pad * 2);
    const y = (m: number) => h - pad - ((m - 1) / (maxM - 1)) * (h - pad * 2);

    this.grid.clear();
    for (const m of plot.gridLevels) {
      if (m > maxM) break;
      this.grid
        .moveTo(pad, y(m))
        .lineTo(w - pad, y(m))
        .stroke({ width: plot.gridWidth, color: colorOf(plot.gridColor), alpha: plot.gridAlpha });
    }

    this.area.clear();
    this.curve.clear();
    this.head.clear();
    if (points.length > 1) {
      const [lt, lm] = points[points.length - 1];
      this.area.moveTo(x(points[0][0]), y(1));
      for (const [t, m] of points) this.area.lineTo(x(t), y(m));
      this.area.lineTo(x(lt), y(1)).closePath().fill({ color, alpha: plot.areaAlpha });
      this.curve.moveTo(x(points[0][0]), y(points[0][1]));
      for (const [t, m] of points) this.curve.lineTo(x(t), y(m));
      this.curve.stroke({ width: plot.curveWidth, color, cap: 'round', join: 'round' });
      this.head
        .circle(0, 0, plot.headRadius)
        .fill(color)
        .circle(0, 0, plot.headGlowRadius)
        .fill({ color, alpha: plot.headGlowAlpha });
      this.head.position.set(x(lt), y(lm));
    }

    const mult = multiplier.toFixed(2);
    this.label.visible = this.sub.visible = !waiting;
    if (this.shownFill !== color) {
      this.shownFill = color;
      this.label.style.fill = color;
    }
    this.label.text = `${mult}x`;
    this.sub.text = crashed ? texts.crashed.replace('{multiplier}', mult) : texts.live;
    const subFill = colorOf(crashed ? colors.subCrashed : colors.subLive);
    if (this.shownSubFill !== subFill) {
      this.shownSubFill = subFill;
      this.sub.style.fill = subFill;
    }
    this.boostLabel.text = props.boost > 0 ? texts.boost.replace('{boost}', props.boost.toFixed(2)) : '';
    // the boost label is placed from the right edge: its configured x is an inset
    this.boostLabel.position.x = w + this.boostInset;
  }
}
