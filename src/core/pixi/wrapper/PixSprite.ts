// PixSprite: adapted from the legacy framework's corelib/pixiwrapper/PixSprite.ts (kept in legacy/corelib). Same members; the `name` field is gone (Pixi 8 has `label`) and the import points at the new UIUtilService.
import { Sprite, type Texture } from 'pixi.js';

import { UIUtil } from '../UIUtilService';

export class PixSprite extends Sprite {
  protected _configData: any;

  constructor(texture: Texture) {
    super(texture);
  }
  public setAnimationSpeed(num: number): void {}

  public playAnimation(options: any = null) {}

  public stopAnimation(): void {}
  public onComplete(): void {}

  public set configData(data: any) {
    this._configData = {};
    if (data) {
      for (const p in data) {
        this._configData[p] = data[p];
      }
    }
  }
  public updateImage(image: string) {
    this.texture = UIUtil.getTexture(image);
  }

  public get configData() {
    return this._configData;
  }

  getConfigData() {
    return this.configData;
  }
  getWidth() {
    return this.width;
  }
  getHeight() {
    return this.height;
  }
}
