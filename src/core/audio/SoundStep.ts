// The rules behind the audio service: file choice, gains, saved settings, and what a new play must stop. Plain TypeScript with no
// browser objects, so `Sound.check.ts` can run it in Node. The Web Audio work is in SoundServiceProxy.ts.
import type { SoundEntry } from './SoundConfig.ts';

export type AudioPrefs = { muted: boolean; volume: number; sfx: boolean; ambient: boolean };
export const DEFAULT_PREFS: AudioPrefs = { muted: false, volume: 1, sfx: true, ambient: true };

const clamp01 = (n: number) => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 1);

/** Saved settings from storage text. Anything missing, wrong or unreadable becomes the default. */
export function parsePrefs(raw: string | null | undefined): AudioPrefs {
  if (!raw) return { ...DEFAULT_PREFS };
  try {
    const v = JSON.parse(raw) as Partial<AudioPrefs> | null;
    if (!v || typeof v !== 'object') return { ...DEFAULT_PREFS };
    return {
      muted: typeof v.muted === 'boolean' ? v.muted : DEFAULT_PREFS.muted,
      volume: typeof v.volume === 'number' ? clamp01(v.volume) : DEFAULT_PREFS.volume,
      sfx: typeof v.sfx === 'boolean' ? v.sfx : DEFAULT_PREFS.sfx,
      ambient: typeof v.ambient === 'boolean' ? v.ambient : DEFAULT_PREFS.ambient,
    };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export const serializePrefs = (p: AudioPrefs): string => JSON.stringify({ ...p, volume: clamp01(p.volume) });

/** The master gain: the user's volume, or silence while muted (the context keeps running, so timing continues). */
export const masterGain = (p: AudioPrefs): number => (p.muted ? 0 : clamp01(p.volume));
/** A group (sound effects, ambient) is on or off. */
export const groupGain = (on: boolean): number => (on ? 1 : 0);

export type AudioFormat = 'ogg' | 'mp3';

/** Formats in the order to try them: ogg first (the legacy order), mp3 when ogg is not supported. Empty when neither is. */
export function formatOrder(support: { ogg: boolean; mp3: boolean }): AudioFormat[] {
  const out: AudioFormat[] = [];
  if (support.ogg) out.push('ogg');
  if (support.mp3) out.push('mp3');
  return out;
}

/** The file of a sound, relative to the assets root: `<soundPath><ext>/<name><language>.<ext>`. */
export function soundFile(entry: SoundEntry, soundPath: string, language: string, format: AudioFormat): string {
  const suffix = entry.langEnabled && language ? language : '';
  return `${soundPath}${format}/${entry.name}${suffix}.${format}`;
}

export type PlayState = {
  /** Instances currently playing (not stopping), by sound name. */
  playing: Map<string, number>;
  /** The ambient track now playing, if any. */
  ambient: string | undefined;
};

export type PlayPlan = {
  /** The same ambient track is already playing: do nothing. */
  skip: boolean;
  /** Stop the running instances of this sound first. */
  stopSame: boolean;
  /** Stop this other ambient track first. */
  stopAmbient: string | undefined;
};

/** What a new play must do first (the legacy playSound rules). */
export function planPlay(entry: SoundEntry, state: PlayState): PlayPlan {
  const ambient = entry.type === 'ambient';
  if (ambient && state.ambient === entry.name) return { skip: true, stopSame: false, stopAmbient: undefined };
  return {
    skip: false,
    stopAmbient: ambient && state.ambient ? state.ambient : undefined,
    stopSame: !entry.dontStopInstances && (state.playing.get(entry.name) ?? 0) > 0,
  };
}

/** Entries whose play events include `event` and whose `matchParam`, if any, equals `param`. */
export const matchingPlay = (entries: SoundEntry[], event: string, param?: string | number): SoundEntry[] =>
  entries.filter((s) => s.playEvents?.includes(event) && (s.matchParam === undefined || s.matchParam === param));

export const matchingStop = (entries: SoundEntry[], event: string): SoundEntry[] =>
  entries.filter((s) => s.stopEvents?.includes(event));
