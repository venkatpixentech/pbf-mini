// The game-level sound configuration: the legacy GAME_SOUND_CONFIG (corelib teamformation/config/SoundLoadConfig.ts) as a typed
// object. A game declares it in its own config file; React passes it to `useSound`. Plain TypeScript (no browser objects), so
// it is checked in Node. Differences from the legacy shape: `langEnagled` is spelled `langEnabled`, and `soundPath` is relative
// to the assets root (`<game>/sounds/`), with the files in its `mp3/` and `ogg/` folders as before.

export type SoundEntry = {
  /** File name without extension (and without the language suffix). */
  name: string;
  /** `sfx` (default) or `ambient`: one ambient track plays at a time. */
  type?: 'sfx' | 'ambient';
  /** 0 to 1, default 1. */
  volume?: number;
  loop?: boolean;
  /** Milliseconds. */
  fadeInDuration?: number;
  fadeOutDuration?: number;
  /** Let a new play overlap a running instance of the same sound (default: it stops the old one). */
  dontStopInstances?: boolean;
  /** Ambient only: remember it so `resumeAmbientSound` can bring it back. */
  resumePreviousSound?: boolean;
  /** The file has a per-language variant: `<name><language>.mp3`. */
  langEnabled?: boolean;
  /** Events (the screen's own names) that play or stop it, through SoundManager.handle. */
  playEvents?: string[];
  stopEvents?: string[];
  /** Play only when the event's parameter equals this. */
  matchParam?: string | number;
};

export type SoundGameConfig = {
  /** Relative to the assets root, ending in a slash: `<game>/sounds/`. */
  soundPath: string;
  soundFiles: SoundEntry[];
};

/** Throws for a config that can never work (called by a game's config.check.ts). */
export function validateSoundConfig(c: SoundGameConfig, where = 'sounds'): void {
  if (!c.soundPath || !c.soundPath.endsWith('/')) throw new Error(`${where}: soundPath must end with a slash`);
  const seen = new Set<string>();
  for (const s of c.soundFiles) {
    const at = `${where}.${s.name || '(no name)'}`;
    if (!s.name) throw new Error(`${at}: name is required`);
    if (seen.has(s.name)) throw new Error(`${at}: duplicate name`);
    seen.add(s.name);
    if (s.type !== undefined && s.type !== 'sfx' && s.type !== 'ambient')
      throw new Error(`${at}: type must be sfx or ambient`);
    if (s.volume !== undefined && !(s.volume >= 0 && s.volume <= 1))
      throw new Error(`${at}: volume must be between 0 and 1`);
    for (const k of ['fadeInDuration', 'fadeOutDuration'] as const)
      if (s[k] !== undefined && !(Number.isFinite(s[k]) && (s[k] as number) >= 0))
        throw new Error(`${at}: ${k} must be 0 or more`);
    if (s.resumePreviousSound && s.type !== 'ambient')
      throw new Error(`${at}: resumePreviousSound is for ambient sounds`);
    for (const k of ['playEvents', 'stopEvents'] as const)
      if (s[k]?.some((e) => !e)) throw new Error(`${at}: ${k} must not contain an empty name`);
    if (s.matchParam !== undefined && !s.playEvents?.length) throw new Error(`${at}: matchParam needs playEvents`);
  }
}
