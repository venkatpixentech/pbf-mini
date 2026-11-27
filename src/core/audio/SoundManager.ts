// SoundManager: adapted from the legacy framework's corelib/sound/SoundManager.ts (kept in legacy/corelib). Same job and config
// (a sound's `playEvents`, `stopEvents` and `matchParam` decide what an event plays or stops), same method names
// (addEvents, onSoundPlayEvent, onSoundStopEvent). What changed: the legacy manager subscribed to a global event bus
// (EventHandler) when it was built. Here the screen already receives every typed scene event and owns the game's state, so it calls
// `handle(event, param)` itself, and no bus is needed. The legacy `isConnected` gate is gone (a screen only calls it when the game
// is running).
import type { SoundEntry, SoundGameConfig } from './SoundConfig';
import type { SoundServiceProxy } from './SoundServiceProxy';
import { matchingPlay, matchingStop } from './SoundStep';

export class SoundManager {
  private entries: SoundEntry[] = [];
  private disposed = false;

  constructor(
    config: SoundGameConfig,
    private readonly service: SoundServiceProxy,
  ) {
    this.addEvents(config);
  }

  addEvents(config: SoundGameConfig): void {
    this.entries = config.soundFiles;
  }

  /** Reports an event: plays the sounds that listen for it (and match its parameter), then stops the ones that stop on it. */
  handle(event: string, param?: string | number): number {
    if (this.disposed) return 0;
    const play = matchingPlay(this.entries, event, param);
    const stop = matchingStop(this.entries, event);
    for (const s of stop) this.onSoundStopEvent(s);
    for (const s of play) this.onSoundPlayEvent(s);
    return play.length + stop.length;
  }

  onSoundPlayEvent(sObj: SoundEntry): void {
    this.service.playSound(sObj);
  }

  onSoundStopEvent(sObj: SoundEntry): void {
    this.service.stopSound(sObj);
  }

  dispose(): void {
    this.disposed = true;
    this.entries = [];
  }
}
