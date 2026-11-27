// PixBMPText: adapted from the legacy framework's corelib/pixiwrapper/PixBMPText.ts (kept in legacy/corelib). Same members; typed as Pixi 8 TextOptions. The bitmap font must be loaded first (AssetLoader kind `bmpfont`).
import { BitmapText, type TextOptions } from 'pixi.js';

export class PixBMPText extends BitmapText {
  set configData(value: any) {
    this._configData = value;
  }
  private _configData: any;
  constructor(textData: TextOptions, configData: any) {
    super(textData);
    this.configData = {};
    // cloning
    for (const p in configData) {
      this.configData[p] = configData[p];
    }
  }
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
