// FPSMeterView: adapted from the legacy framework's corelib/pixiwrapper/FPSMeterView.ts (kept in legacy/corelib). Same readout ("FPS : n",
// green above 50, red below 30, yellow between). Changed, and why:
//  - It is a development aid: it reads the stage's own ticker (not Ticker.shared) and removes its callback on destroy; the legacy one never did.
//  - `showFpsMeter` only creates it in a dev build and when the URL has `?fps=1`, so a production build never contains the meter
//    (the import.meta.env.DEV branch is removed at build time and the module is then unreferenced).
import { Container, Text, type Ticker } from 'pixi.js';

const GREEN = 0x00ff00;
const RED = 0xff0000;
const YELLOW = 0xffff00;

export const fpsColor = (fps: number) => (fps > 50 ? GREEN : fps < 30 ? RED : YELLOW);

export class FPSMeterView extends Container {
  private readonly readout = new Text({ text: 'FPS : --', style: { fontSize: 14, fill: 0xffffff } });
  private readonly ticker: Ticker;
  private readonly onTick = () => this.updateFPS();
  private frames = 0;
  private elapsed = 0;

  constructor(ticker: Ticker) {
    super();
    this.ticker = ticker;
    this.readout.tint = YELLOW;
    this.addChild(this.readout);
    this.eventMode = 'none';
    ticker.add(this.onTick);
  }

  /** The text on screen, for tests. */
  get text(): string {
    return this.readout.text;
  }

  private updateFPS() {
    this.frames++;
    this.elapsed += this.ticker.elapsedMS;
    if (this.elapsed < 500) return;
    const fps = Math.round((this.frames * 1000) / this.elapsed);
    this.readout.text = `FPS : ${fps}`;
    this.readout.tint = fpsColor(fps);
    this.frames = 0;
    this.elapsed = 0;
  }

  override destroy(): void {
    if (this.destroyed) return;
    this.ticker.remove(this.onTick);
    super.destroy({ children: true });
  }
}

/** A meter for a dev build when the page was opened with `?fps=1`; otherwise null. Production builds always get null. */
export function showFpsMeter(ticker: Ticker): FPSMeterView | null {
  if (!import.meta.env.DEV) return null;
  if (new URLSearchParams(window.location.search).get('fps') !== '1') return null;
  return new FPSMeterView(ticker);
}
