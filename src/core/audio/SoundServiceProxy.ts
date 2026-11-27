// SoundServiceProxy: adapted from the legacy framework's corelib/sound/SoundServiceProxy.ts (kept in legacy/corelib). Same
// names and behaviour (loadSounds, playSound, stopSound, sfxState, ambientState, muteAllSounds, unmuteAllSounds, checkToMute,
// checkToUnmute, resumeAmbientSound; sound effects and exclusive ambient tracks; retrigger stops the old instance; fades; per-language
// files) on Web Audio instead of Howler. What changed, and why:
//  - Lazy and renderer-independent: nothing here imports Pixi, and a screen loads this module with import() only when it
//    needs sound, so no game's boot downloads it. The AudioContext is created the first time it is needed.
//  - One service per mounted screen (createSoundService), disposed with it: it stops every source, removes every listener,
//    closes the context and drops the buffers. The legacy one was a global that lived forever.
//  - First-gesture unlock: the context starts suspended in a browser. `unlockOn` resumes it on the first pointer or key gesture
//    and removes its listeners only after the resume succeeds, so a failed resume is retried by the next gesture. Plays asked for before
//    that are dropped, except a looping ambient track, which starts at unlock.
//  - Mute is the master gain at zero (the context keeps running); the volume and the sound-effect and ambient groups are gains too,
//    with a short ramp. The legacy isSoundOn flag, which was never set and muted the first play, is gone.
//  - Settings are the user's: kept in React state through `subscribe` / `getSnapshot`, saved to storage when it is available, and
//    working for the session when it is not.
//  - Failure never reaches the game: a file that cannot be loaded or decoded warns once and is silent. A missing file is retried once.
//  - Gone: Howler, the global event bus (the screen calls SoundManager.handle), the WrapperProxy language and the isConnected gate.
import { assetUrl } from 'core/boot/assetUrl';
import { runQueue } from 'core/boot/loadQueue';
import { getLanguage } from 'core/i18n';
import { warnOnce } from 'core/utils/LoggerService';

import type { SoundEntry } from './SoundConfig';
import {
  type AudioFormat,
  type AudioPrefs,
  formatOrder,
  groupGain,
  masterGain,
  parsePrefs,
  planPlay,
  serializePrefs,
  soundFile,
} from './SoundStep';

export type SoundHandle = { stop(fadeMs?: number): void };

export type SoundSnapshot = AudioPrefs & {
  /** True once the browser lets this page play sound (a gesture has resumed the context). */
  unlocked: boolean;
  state: AudioContextState | 'none';
};

export type SoundServiceOptions = {
  /** Relative to the assets root, ending in a slash (SoundGameConfig.soundPath). */
  soundPath: string;
  /** Where settings are saved. Omit to keep them for the session only. */
  storageKey?: string;
  storage?: Pick<Storage, 'getItem' | 'setItem'>;
  language?: () => string;
  /** Pause while the tab is hidden (default true). */
  suspendWhenHidden?: boolean;
};

type Instance = { entry: SoundEntry; source: AudioBufferSourceNode; gain: GainNode; stopping: boolean };

/** Per attempt; a missing file is tried once more before it is given up. */
const LOAD_TIMEOUT_MS = 15_000;
const RAMP_S = 0.02;

export class SoundServiceProxy {
  private ctx: AudioContext | undefined;
  private master: GainNode | undefined;
  private groups: { sfx: GainNode; ambient: GainNode } | undefined;
  private analyser: AnalyserNode | undefined;
  private readonly buffers = new Map<string, AudioBuffer>();
  private readonly failed = new Set<string>();
  private readonly entries = new Map<string, SoundEntry>();
  private readonly instances = new Map<string, Set<Instance>>();
  private ambientPlaying: string | undefined;
  private lastAmbient: string | undefined;
  private pendingAmbient: SoundEntry | undefined;
  private prefs: AudioPrefs;
  private snapshot: SoundSnapshot;
  private readonly listeners = new Set<() => void>();
  private unlocked = false;
  private unlockOff: (() => void) | undefined;
  private visibilityOff: (() => void) | undefined;
  private disposed = false;
  private readonly storage: Pick<Storage, 'getItem' | 'setItem'> | undefined;

  constructor(private readonly options: SoundServiceOptions) {
    this.storage = options.storage ?? this.defaultStorage();
    let raw: string | null = null;
    try {
      raw = options.storageKey && this.storage ? this.storage.getItem(options.storageKey) : null;
    } catch {
      raw = null; // blocked storage: defaults for this session
    }
    this.prefs = parsePrefs(raw);
    this.snapshot = this.makeSnapshot();
  }

  private defaultStorage() {
    try {
      return window.localStorage;
    } catch {
      return undefined;
    }
  }

  // ---- settings, for React ----

  public subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => void this.listeners.delete(listener);
  };

  public getSnapshot = (): SoundSnapshot => this.snapshot;

  private makeSnapshot(): SoundSnapshot {
    return { ...this.prefs, unlocked: this.unlocked, state: this.ctx?.state ?? 'none' };
  }

  private changed() {
    this.snapshot = this.makeSnapshot();
    for (const l of [...this.listeners]) l();
  }

  private save() {
    const key = this.options.storageKey;
    if (!key || !this.storage) return;
    try {
      this.storage.setItem(key, serializePrefs(this.prefs));
    } catch {
      /* blocked storage: the settings still work for this session */
    }
  }

  private applyGains() {
    if (!this.ctx || !this.master || !this.groups) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(masterGain(this.prefs), t, RAMP_S);
    this.groups.sfx.gain.setTargetAtTime(groupGain(this.prefs.sfx), t, RAMP_S);
    this.groups.ambient.gain.setTargetAtTime(groupGain(this.prefs.ambient), t, RAMP_S);
  }

  private update(patch: Partial<AudioPrefs>) {
    if (this.disposed) return;
    this.prefs = { ...this.prefs, ...patch };
    this.applyGains();
    this.save();
    this.changed();
  }

  public get soundState(): boolean {
    return this.prefs.sfx;
  }
  public get sfxState(): boolean {
    return this.prefs.sfx;
  }
  public set sfxState(flag: boolean) {
    this.update({ sfx: flag });
  }
  public get ambientState(): boolean {
    return this.prefs.ambient;
  }
  public set ambientState(flag: boolean) {
    this.update({ ambient: flag });
  }
  public setSfx(on: boolean): void {
    this.update({ sfx: on });
  }
  public setAmbient(on: boolean): void {
    this.update({ ambient: on });
  }
  public setVolume(volume: number): void {
    this.update({ volume: Math.min(1, Math.max(0, Number.isFinite(volume) ? volume : 1)) });
  }
  public setMuted(muted: boolean): void {
    this.update({ muted });
  }
  public muteAllSounds(): void {
    this.setMuted(true);
  }
  public unmuteAllSounds(): void {
    this.setMuted(false);
  }

  /** The legacy focus-lost mute: pause the context (a user's own mute is not touched). */
  public checkToMute(): void {
    if (this.ctx && this.ctx.state === 'running') void this.ctx.suspend().catch(() => undefined);
  }
  public checkToUnmute(): void {
    if (this.ctx && this.unlocked && this.ctx.state !== 'running' && !this.disposed)
      void this.ctx.resume().catch(() => undefined);
  }

  // ---- the audio context ----

  private ensureContext(): AudioContext | undefined {
    if (this.disposed) return undefined;
    if (this.ctx) return this.ctx;
    const Ctor: typeof AudioContext | undefined =
      typeof AudioContext !== 'undefined'
        ? AudioContext
        : (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) {
      warnOnce('audio', 'Web Audio is not available; sound is off');
      return undefined;
    }
    const ctx = new Ctor();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.groups = { sfx: ctx.createGain(), ambient: ctx.createGain() };
    this.groups.sfx.connect(this.master);
    this.groups.ambient.connect(this.master);
    this.master.connect(ctx.destination);
    this.master.gain.value = masterGain(this.prefs);
    this.groups.sfx.gain.value = groupGain(this.prefs.sfx);
    this.groups.ambient.gain.value = groupGain(this.prefs.ambient);
    ctx.onstatechange = () => {
      if (ctx.state === 'running') this.becameRunning();
      else this.changed();
    };
    if (this.options.suspendWhenHidden !== false && typeof document !== 'undefined') {
      const onVisibility = () => (document.hidden ? this.checkToMute() : this.checkToUnmute());
      document.addEventListener('visibilitychange', onVisibility);
      this.visibilityOff = () => document.removeEventListener('visibilitychange', onVisibility);
    }
    if (ctx.state === 'running') this.becameRunning(); // the browser already allows sound
    return ctx;
  }

  private becameRunning() {
    this.unlocked = true;
    this.removeUnlockListeners();
    const pending = this.pendingAmbient;
    this.pendingAmbient = undefined;
    this.changed();
    if (pending) this.playSound(pending);
  }

  private removeUnlockListeners() {
    this.unlockOff?.();
    this.unlockOff = undefined;
  }

  /**
   * Resumes the audio context on the first gesture. The listeners stay until a resume has really succeeded, so a failed resume is
   * retried by the next gesture. Returns a function that removes them early.
   */
  public unlockOn(target: Window | Document | HTMLElement = window): () => void {
    const ctx = this.ensureContext();
    if (!ctx || this.unlocked || this.unlockOff) return () => this.removeUnlockListeners();
    const types = ['pointerdown', 'keydown', 'touchend'] as const;
    let busy = false;
    const onGesture = () => {
      if (busy || this.disposed) return;
      busy = true;
      ctx
        .resume()
        .then(() => {
          if (ctx.state === 'running') this.becameRunning();
        })
        .catch(() => undefined) // not allowed yet: the listeners stay for the next gesture
        .finally(() => {
          busy = false;
        });
    };
    for (const t of types) target.addEventListener(t, onGesture, { capture: true });
    this.unlockOff = () => {
      for (const t of types) target.removeEventListener(t, onGesture, { capture: true });
    };
    return () => this.removeUnlockListeners();
  }

  // ---- loading ----

  private formats(): AudioFormat[] {
    const audio = new Audio();
    return formatOrder({
      ogg: !!audio.canPlayType('audio/ogg; codecs=vorbis'),
      mp3: !!audio.canPlayType('audio/mpeg'),
    });
  }

  private key(entry: SoundEntry) {
    return entry.name;
  }

  /**
   * Loads and decodes the sounds (each file gets a timeout and one retry). Resolves when all are ready; rejects, after trying
   * them all, if any could not be loaded: a screen that does not wait for it simply has silence for those sounds.
   */
  public async loadSounds(
    list: SoundEntry[],
    options: { onProgress?: (done: number, total: number) => void } = {},
  ): Promise<void> {
    const ctx = this.ensureContext();
    for (const e of list) this.entries.set(e.name, e);
    if (!ctx) return;
    const format = this.formats()[0];
    if (!format) {
      warnOnce('audio', 'this browser plays neither ogg nor mp3; sound is off');
      return;
    }
    const language = (this.options.language ?? getLanguage)();
    let done = 0;
    const errors: unknown[] = [];
    await Promise.all(
      list.map(async (entry) => {
        const k = this.key(entry);
        if (this.buffers.has(k)) return;
        try {
          const url = assetUrl(soundFile(entry, this.options.soundPath, language, format));
          const buffers = await runQueue(
            [url],
            async (u) => {
              const response = await fetch(u);
              if (!response.ok) throw new Error(`${response.status} ${u}`);
              return ctx.decodeAudioData(await response.arrayBuffer());
            },
            { timeoutMs: LOAD_TIMEOUT_MS, retries: 1 },
          );
          if (!this.disposed) this.buffers.set(k, buffers.get(url)!);
        } catch (error) {
          this.failed.add(k);
          warnOnce('audio', `sound "${entry.name}" could not be loaded; it stays silent`);
          errors.push(error);
        } finally {
          options.onProgress?.(++done, list.length);
        }
      }),
    );
    if (errors.length) throw errors[0];
  }

  // ---- playing ----

  private entryOf(entryOrName: SoundEntry | string): SoundEntry | undefined {
    return typeof entryOrName === 'string'
      ? this.entries.get(entryOrName)
      : (this.entries.get(entryOrName.name) ?? entryOrName);
  }

  private playingCounts(): Map<string, number> {
    const m = new Map<string, number>();
    for (const [name, set] of this.instances) {
      const n = [...set].filter((i) => !i.stopping).length;
      if (n) m.set(name, n);
    }
    return m;
  }

  public playSound(entryOrName: SoundEntry | string, fadeMs?: number): SoundHandle | undefined {
    const entry = this.entryOf(entryOrName);
    const ctx = this.ctx;
    if (!entry || this.disposed || !ctx || !this.groups) return undefined;
    const buffer = this.buffers.get(this.key(entry));
    if (!buffer) {
      if (!this.failed.has(this.key(entry)))
        warnOnce('audio', `sound "${entry.name}" is not loaded; call loadSounds first`);
      return undefined;
    }
    if (ctx.state !== 'running') {
      // locked: a sound effect is dropped, a looping ambient track waits for the unlock
      if (entry.type === 'ambient' && entry.loop) this.pendingAmbient = entry;
      return undefined;
    }
    const plan = planPlay(entry, { playing: this.playingCounts(), ambient: this.ambientPlaying });
    if (plan.skip) return undefined;
    if (plan.stopAmbient) this.stopSound(plan.stopAmbient, 0);
    if (plan.stopSame) this.stopSound(entry, 0);

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = !!entry.loop;
    const gain = ctx.createGain();
    const volume = entry.volume ?? 1;
    const fadeIn = (fadeMs ?? entry.fadeInDuration ?? 0) / 1000;
    const now = ctx.currentTime;
    gain.gain.setValueAtTime(fadeIn > 0 ? 0 : volume, now);
    if (fadeIn > 0) gain.gain.linearRampToValueAtTime(volume, now + fadeIn);
    source.connect(gain);
    gain.connect(entry.type === 'ambient' ? this.groups.ambient : this.groups.sfx);
    const instance: Instance = { entry, source, gain, stopping: false };
    let set = this.instances.get(entry.name);
    if (!set) this.instances.set(entry.name, (set = new Set()));
    set.add(instance);
    if (entry.type === 'ambient') {
      this.ambientPlaying = entry.name;
      if (entry.resumePreviousSound) this.lastAmbient = entry.name;
    }
    source.onended = () => {
      set!.delete(instance);
      source.disconnect();
      gain.disconnect();
      if (!set!.size) this.instances.delete(entry.name);
      if (this.ambientPlaying === entry.name && !this.instances.has(entry.name)) this.ambientPlaying = undefined;
    };
    source.start();
    return { stop: (ms) => this.stopInstance(instance, ms ?? entry.fadeOutDuration ?? 0) };
  }

  private stopInstance(instance: Instance, fadeMs: number) {
    if (instance.stopping || !this.ctx) return;
    instance.stopping = true;
    if (instance.entry.type === 'ambient' && this.ambientPlaying === instance.entry.name)
      this.ambientPlaying = undefined;
    const now = this.ctx.currentTime;
    try {
      if (fadeMs > 0) {
        const g = instance.gain.gain;
        g.cancelScheduledValues(now);
        g.setValueAtTime(g.value, now);
        g.linearRampToValueAtTime(0, now + fadeMs / 1000);
        instance.source.stop(now + fadeMs / 1000);
      } else instance.source.stop();
    } catch {
      /* already ended */
    }
  }

  /** Stops every instance of a sound (with its fade-out unless `fadeMs` is given). */
  public stopSound(entryOrName: SoundEntry | string, fadeMs?: number): void {
    const entry = this.entryOf(entryOrName);
    const name = entry?.name ?? (typeof entryOrName === 'string' ? entryOrName : entryOrName.name);
    if (this.pendingAmbient?.name === name) this.pendingAmbient = undefined;
    for (const i of [...(this.instances.get(name) ?? [])]) this.stopInstance(i, fadeMs ?? entry?.fadeOutDuration ?? 0);
  }

  public stopAll(fadeMs = 0): void {
    this.pendingAmbient = undefined;
    for (const set of this.instances.values()) for (const i of [...set]) this.stopInstance(i, fadeMs);
  }

  public resumeAmbientSound(): void {
    if (this.lastAmbient) this.playSound(this.lastAmbient);
  }

  // ---- for tests and diagnostics ----

  /** An analyser on the output, to measure what is playing. Created the first time it is asked for. */
  public getAnalyser(): AnalyserNode | undefined {
    if (!this.ctx || !this.master) return undefined;
    if (!this.analyser) {
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 512;
      this.master.disconnect();
      this.master.connect(this.analyser);
      this.analyser.connect(this.ctx.destination);
    }
    return this.analyser;
  }

  public stats() {
    return {
      state: this.ctx?.state ?? 'none',
      unlocked: this.unlocked,
      playing: [...this.playingCounts().values()].reduce((a, b) => a + b, 0),
      buffers: this.buffers.size,
      failed: [...this.failed],
      pendingAmbient: this.pendingAmbient?.name,
      ambient: this.ambientPlaying,
    };
  }

  // ---- teardown ----

  /** Stops every sound, removes every listener, closes the context and drops the buffers. Safe to call more than once. */
  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.removeUnlockListeners();
    this.visibilityOff?.();
    this.visibilityOff = undefined;
    for (const set of this.instances.values())
      for (const i of set) {
        i.source.onended = null;
        try {
          i.source.stop();
        } catch {
          /* already ended */
        }
        i.source.disconnect();
        i.gain.disconnect();
      }
    this.instances.clear();
    this.buffers.clear();
    this.pendingAmbient = undefined;
    this.ambientPlaying = undefined;
    this.listeners.clear();
    const ctx = this.ctx;
    if (ctx) {
      ctx.onstatechange = null;
      void ctx.close().catch(() => undefined);
    }
    this.ctx = undefined;
    this.master = undefined;
    this.groups = undefined;
    this.analyser = undefined;
  }
}

export const createSoundService = (options: SoundServiceOptions) => new SoundServiceProxy(options);
