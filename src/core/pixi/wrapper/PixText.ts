// PixText: adapted from the legacy framework's corelib/pixiwrapper/PixText.ts (kept in legacy/corelib). Same members; `textData` is typed as Pixi 8 TextOptions (the legacy call already used the v8 options form).
import { Text, type TextOptions } from 'pixi.js';

export class PixText extends Text {
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
