// Early renderer preparation for Pixi games, run by GameBoot while the network is still busy.
//
// Pixi's Application.init first probes WebGL support with a throw-away context (isWebGLSupported), which
// also brings up the browser's GPU process. Measured on the first stage of a cold start that probe and the
// GPU start-up are a large part of a 500 ms (desktop) to 1.2 s (mobile, 4x CPU) main-thread task.
// isWebGLSupported caches its answer, so running it here, while the boot waits for the network, takes
// that cost off the path between "data ready" and "first frame". It creates no renderer and keeps no context.
import { isWebGLSupported } from 'pixi.js';

export function warmRenderer(): boolean {
  return isWebGLSupported();
}
