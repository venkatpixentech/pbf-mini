// PixContainer: adapted from the legacy framework's corelib/pixiwrapper/PixContainer.ts (kept in legacy/corelib). The legacy class extended BaseView (config-built children and resize listeners that were never removed; not carried, see the capability matrix). This one is a plain Container that keeps `configData` and reports its drawn size.
import { Container } from 'pixi.js';

export class PixContainer extends Container {
  protected _configData: any;
  constructor(config: any = null) {
    super();
    this.configData = config;
  }
  public set configData(data: any) {
    this._configData = {};
    if (data) {
      for (const p in data) {
        this._configData[p] = data[p];
      }
    }
  }
  public get configData() {
    return this._configData;
  }

  getWidth() {
    return this.width;
  }
  getHeight() {
    return this.height;
  }
}
