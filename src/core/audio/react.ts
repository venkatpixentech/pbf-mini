// React access to the audio service: the user's settings as state, and one service per mounted screen. The controls themselves
// (a mute button, a volume slider) are the game's own React UI; they call setMuted and setVolume on the service.
import { useEffect, useState, useSyncExternalStore } from 'react';

import type { SoundGameConfig } from './SoundConfig';
import { SoundManager } from './SoundManager';
import { createSoundService, type SoundServiceProxy, type SoundSnapshot } from './SoundServiceProxy';

/** The service's settings (muted, volume, sound effects, ambient, unlocked, context state), live. */
export function useSoundSettings(service: SoundServiceProxy | null): SoundSnapshot | null {
  return useSyncExternalStore(
    (cb) => (service ? service.subscribe(cb) : () => undefined),
    () => service?.getSnapshot() ?? null,
  );
}

export type GameSound = { service: SoundServiceProxy; manager: SoundManager };

/**
 * Creates the sound service and manager for a screen, unlocks audio on the first gesture, loads the sounds, and disposes everything
 * when the screen unmounts (safe under React StrictMode). Returns null until it is ready to take calls. A load failure leaves
 * silence for the affected sounds and does not reach the game.
 */
export function useSound(config: SoundGameConfig, options: { storageKey?: string } = {}): GameSound | null {
  const [sound, setSound] = useState<GameSound | null>(null);
  const storageKey = options.storageKey;
  useEffect(() => {
    const service = createSoundService({ soundPath: config.soundPath, storageKey });
    const manager = new SoundManager(config, service);
    service.unlockOn(window);
    // the service is created with this effect so it is disposed with it (and recreated under StrictMode)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSound({ service, manager });
    void service.loadSounds(config.soundFiles).catch(() => undefined);
    return () => {
      manager.dispose();
      service.dispose();
      setSound(null);
    };
  }, [config, storageKey]);
  return sound;
}
