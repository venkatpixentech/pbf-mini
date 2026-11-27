// PixGraphics: adapted from the legacy framework's corelib/pixiwrapper/PixGraphics.ts (kept in legacy/corelib). Same members.
import { Graphics } from 'pixi.js';

export class PixGraphics extends Graphics {
  protected _configData: any;

  public set configData(data: any) {
    this._configData = {};
    if (data) {
      for (const p in data) {
        this._configData[p] = data[p];
      }
    }
  }
  public playAnimation(): void {}
  public stopAnimation(): void {}

  public get configData() {
    return this._configData;
  }
  public getWidth(): number {
    return this.width;
  }
  public getHeight(): number {
    return this.height;
  }
}
