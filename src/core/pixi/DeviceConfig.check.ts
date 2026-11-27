// Self-check: node --experimental-strip-types --no-warnings src/core/pixi/DeviceConfig.check.ts
// Device classes, orientation, pixel ratio and asset resolution for the supported viewports.
import assert from 'node:assert/strict';

import { type DeviceAgent, deviceConfig } from './DeviceConfigStep.ts';

const desktop: DeviceAgent = { phone: false, tablet: false, apple: { device: false, phone: false } };
const phone: DeviceAgent = { phone: true, tablet: false, apple: { device: true, phone: true } };
const tablet: DeviceAgent = { phone: false, tablet: true, apple: { device: true, phone: false } };

{
  const d = deviceConfig(1280, 720, desktop, 1);
  assert.equal(d.isDesktop, true);
  assert.equal(d.isDevice, false);
  assert.equal(d.assetResolution, '@1x');
  assert.equal(d.orientation, 1);
  assert.equal(d.isLandscape, true);
  assert.equal(d.gameWidth, 1280);
}
{
  const d = deviceConfig(390, 844, phone, 3);
  assert.equal(d.isMobile, true);
  assert.equal(d.isIOSMobile, true);
  assert.equal(d.assetResolution, '@0.5x'); // phones load the half-size variant
  assert.equal(d.orientation, 2);
  assert.equal(d.isPortrait, true);
  assert.equal(d.pixelRatio, 2); // capped at 2, like PixiStage
  assert.equal(d.pixelRatioString, '@2x');
  assert.equal(d.gameHeight, 844 * 2);
  assert.ok(Math.abs(d.scaleFactor - 844 / 390) < 1e-9);
  assert.equal(d.fontFactor, 3);
}
assert.equal(deviceConfig(768, 1024, tablet, 2).assetResolution, '@1x');
assert.equal(deviceConfig(768, 1024, tablet, 2).isDevice, true);

// the sizes a stage really has: tiny frames and zero before the first resize never give NaN
for (const [w, h] of [
  [202, 356],
  [202, 275],
  [224, 237],
  [0, 0],
  [NaN, 100],
] as const) {
  const d = deviceConfig(w, h, desktop, 1);
  assert.ok([d.scaleFactor, d.gameWidth, d.gameHeight, d.pixelRatio].every(Number.isFinite), `${w}x${h}`);
}
// a missing or invalid pixel ratio is 1
assert.equal(deviceConfig(100, 100, desktop, 0).pixelRatio, 1);
assert.equal(deviceConfig(100, 100, desktop, NaN).pixelRatio, 1);
// a square stage is landscape (the legacy rule: portrait only when taller than wide)
assert.equal(deviceConfig(500, 500, desktop, 1).orientation, 1);

console.log('DeviceConfig.check: ok');
