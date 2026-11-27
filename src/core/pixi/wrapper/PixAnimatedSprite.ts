// PixAnimatedSprite: adapted from the legacy framework's corelib/pixiwrapper/PixAnimatedSprite.ts (kept in legacy/corelib). Same members and the REPEAT_ANIMATION_COMPLETED event. The legacy GameProxy.config.globalAnimSpeed is the `animationSpeed` of the sprite's own config (default 1): there is no global bag in the new core.
import { AnimatedSprite, type Texture } from 'pixi.js';

export class PixAnimatedSprite extends AnimatedSprite {
  protected _configData: any;
  private repeat = 1;
  private loopIndex = 0;
  constructor(textureArray: Array<Texture>, config: any) {
    super(textureArray);
    this.configData = config;
    this.animationSpeed = this.configData?.animationSpeed ?? 1;
    this.onComplete = this.onAnimComplete.bind(this);
  }

  protected onAnimComplete(): void {
    this.loopIndex++;
    if (this.loopIndex == this.repeat) {
      this.emit('REPEAT_ANIMATION_COMPLETED');
    } else {
      this.gotoAndPlay(0);
    }
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

  public playReverseAnimation(): void {
    this.gotoAndStop(this.totalFrames - 1);
    this.animationSpeed = -this.animationSpeed;
    this.loop = false;
    this.gotoAndPlay(this.totalFrames - 1);
  }

  public playAnimation(options: any = null) {
    if (!options) {
      options = {};
    }
    this.animationSpeed = this.configData?.animationSpeed ?? 1;
    this.loop = options.loop == undefined ? true : options.loop;
    this.repeat = options.repeat == undefined ? 1 : options.repeat;
    this.loopIndex = 0;
    this.gotoAndPlay(options.frameNumber == undefined ? 0 : options.frameNumber);
  }
  public destroySymbol(): void {
    this.stopAnimation();
  }

  public stopAnimation(): void {
    this.gotoAndStop(0);
  }

  public updateFrames(textureArray: Array<Texture>): void {
    this.textures = textureArray;
  }

  public getConfigData(): any {
    return this.configData;
  }

  public setAnimationSpeed(num: number): void {
    this.animationSpeed = num;
  }

  getWidth() {
    return this.width;
  }
  getHeight() {
    return this.height;
  }
}
