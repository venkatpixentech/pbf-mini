// What DeviceConfigProxy knows about the device, worked out from a few inputs. Plain TypeScript with no Pixi or window access,
// so `DeviceConfig.check.ts` can run it in Node. The reading of the real device is in DeviceConfigProxy.ts.
import type { AssetResolution } from './AssetLoaderStep.ts';

/** The part of Pixi's `isMobile` this needs. */
export type DeviceAgent = { phone: boolean; tablet: boolean; apple: { device: boolean; phone: boolean } };

export type DeviceConfig = {
  windowWidth: number;
  windowHeight: number;
  isIOSDevice: boolean;
  isIOSMobile: boolean;
  isTablet: boolean;
  isMobile: boolean;
  isDesktop: boolean;
  isDevice: boolean;
  /** 1 landscape, 2 portrait (the legacy numbers). */
  orientation: 1 | 2;
  isLandscape: boolean;
  isPortrait: boolean;
  /** The long side over the short side. */
  scaleFactor: number;
  /** Canvas resolution: the device pixel ratio, at most 2 (as PixiStage). */
  pixelRatio: number;
  fontFactor: number;
  pixelRatioString: string;
  appResolution: number;
  /** Which asset variant to load: full size for desktop and tablet, half size for phones. */
  assetResolution: AssetResolution;
  gameWidth: number;
  gameHeight: number;
};

/**
 * The legacy readDevice, as a pure function. One difference: the legacy code forced a pixel ratio of 2 on every device, the
 * canvas here uses the real ratio capped at 2, which is what PixiStage does.
 */
export function deviceConfig(
  width: number,
  height: number,
  agent: DeviceAgent,
  devicePixelRatio: number,
): DeviceConfig {
  const w = Number.isFinite(width) && width > 0 ? width : 0;
  const h = Number.isFinite(height) && height > 0 ? height : 0;
  const isDesktop = !agent.phone && !agent.tablet;
  const isLandscape = !(h > w);
  const ratio = Math.min(Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1, 2);
  const long = Math.max(w, h);
  const short = Math.min(w, h);
  return {
    windowWidth: w,
    windowHeight: h,
    isIOSDevice: agent.apple.device,
    isIOSMobile: agent.apple.phone,
    isTablet: agent.tablet,
    isMobile: agent.phone,
    isDesktop,
    isDevice: agent.phone || agent.tablet,
    orientation: isLandscape ? 1 : 2,
    isLandscape,
    isPortrait: !isLandscape,
    scaleFactor: short > 0 ? long / short : 1,
    pixelRatio: ratio,
    fontFactor: Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1,
    pixelRatioString: `@${ratio}x`,
    appResolution: ratio,
    assetResolution: isDesktop || agent.tablet ? '@1x' : '@0.5x',
    gameWidth: w * ratio,
    gameHeight: h * ratio,
  };
}
