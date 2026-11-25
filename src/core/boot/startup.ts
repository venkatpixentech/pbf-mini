// Startup lifecycle shared by every game, Pixi or not. No renderer imports here.
//
// Stages are recorded as performance marks named `pbf:<stage>` so the startup timeline can be read in
// DevTools (Performance panel, User Timing) or with performance.getEntriesByType('mark').
// `playable` is the only mark that matters to the player: the screen is mounted, its first frame is
// drawn and the loading overlay is gone, so input reaches the game.

export type StartupStage =
  | 'bootstrap' // boot code running
  | 'session' // session validated (game init response received)
  | 'i18n' // language dictionaries loaded
  | 'fonts' // critical fonts ready (or given up after their timeout)
  | 'code' // game screen code loaded
  | 'critical-assets' // assets needed by the first screen loaded
  | 'renderer-warm' // renderer support probed early (Pixi games)
  | 'critical' // everything the first screen needs is ready
  | 'renderer' // critical Pixi stage created
  | 'scene' // critical Pixi scene built
  | 'first-render' // critical Pixi scene drawn once
  | 'playable'; // overlay removed, input enabled

const marked = new Set<string>();

/** Records a startup mark once per page. */
export function markStartup(stage: StartupStage) {
  if (marked.has(stage)) return;
  marked.add(stage);
  performance.mark(`pbf:${stage}`);
}

// The critical scene (the Pixi stage a game marks `critical`) reports once: drawn, or failed.
type Listener = (ok: boolean) => void;
const listeners = new Set<Listener>();
let criticalScene: boolean | null = null;

/** Called by PixiStage for a `critical` stage after its first frame (ok) or when it fails (not ok). */
export function reportCriticalScene(ok: boolean) {
  if (criticalScene !== null) return;
  criticalScene = ok;
  listeners.forEach((listener) => listener(ok));
  listeners.clear();
}

/** GameBoot waits on this before removing the loading overlay of a Pixi game. */
export function onCriticalScene(listener: Listener): () => void {
  if (criticalScene !== null) {
    listener(criticalScene);
    return () => {};
  }
  listeners.add(listener);
  return () => listeners.delete(listener);
}
