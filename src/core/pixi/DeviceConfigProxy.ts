// DeviceConfigProxy: adapted from the legacy framework's corelib/models/DeviceConfigProxy.ts (kept in legacy/corelib).
// Same names (DeviceProxy, readDevice, config, stageScale, isDesktop, isDevice, checkOrientation). What changed: the numbers
// are worked out by the pure `deviceConfig` (DeviceConfigStep.ts, checked in Node); AbstractProxy, the host name, the IE11
// flag and the Vite env check are gone; the pixel ratio is the real ratio capped at 2 (the legacy code forced 2); and the
// config is read from the device on first use, so a screen does not have to call readDevice first.
import { isMobile } from 'pixi.js';

import { type DeviceConfig, deviceConfig } from './DeviceConfigStep';

class DeviceConfigProxy {
  private _config: DeviceConfig | undefined;
  private _stageScale = 1;

  get stageScale(): number {
    return this._stageScale;
  }

  set stageScale(value: number) {
    this._stageScale = value;
  }

  /** What the device is and which asset variant it loads. Read from the window the first time it is needed. */
  get config(): DeviceConfig {
    if (!this._config) this.readDevice(window.innerWidth, window.innerHeight);
    return this._config!;
  }

  public readDevice(wid: number, ht: number): void {
    this._config = deviceConfig(wid, ht, isMobile, window.devicePixelRatio);
  }

  isDesktop(): boolean {
    return !isMobile.phone && !isMobile.tablet;
  }

  isDevice(): boolean {
    return !this.isDesktop();
  }

  /** 1 landscape, 2 portrait. */
  checkOrientation(): number {
    return this.config.orientation;
  }
}

export const DeviceProxy = new DeviceConfigProxy();
