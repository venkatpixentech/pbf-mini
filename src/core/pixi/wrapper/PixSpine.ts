// PixSpine: adapted from the legacy framework's corelib/pixiwrapper/PixSpine.ts (kept in legacy/corelib). Same class,
// member names (`configData`, `anchor`, `spineAnim`) and calls (setAnimationSpeed, setSkin, prepareAnimation,
// playAnimation, playReverseAnimation, stopAnimation, getWidth, getHeight, removeEventListners). What changed, and why:
//  - Pixi 8 and the lazy runtime: `@pixi/spine-pixi` is never imported statically, so the object is built by the async
//    `PixSpine.create` after the stage has loaded the asset (PixiStage `spine` prop); the constructor is private.
//    Aliases follow the legacy naming: asset `effects` is read from `effectsData` and `effectsAtlas`.
//  - The legacy class never added its Spine object to the display list, so it drew nothing: it is a child now.
//  - It extended the old StandardView (not carried; see the capability matrix): it extends Container.
//  - Spine's own auto update runs on Ticker.shared, which keeps going when a stage is paused or the tab is hidden: it is
//    switched off and the stage's ticker drives it.
//  - `addEventListener` is renamed `addSpineListener`: Pixi's Container already owns that name with another signature.
//  - setAnimationSpeed, playReverseAnimation and stopAnimation were empty or commented out: they work now.
//  - Legacy playAnimation set defaultMix to 1 (a one second blend into every later animation): mixing now comes from the view config.
// Added: play (tracks, queue, mix, reverse, start time), reset, clearTrack, setEmptyAnimation, listen, setAttachment,
// attach, detach, place (position, scale, flip, fit to a box) and destroy.
import { Container, type DestroyOptions, type Ticker } from 'pixi.js';
import type { AnimationStateListener, Event as SpineEvent, Spine, Skin, TrackEntry } from '@pixi/spine-pixi';

import { trackGroup } from '../AnimationServiceProxy';
import type { StageHost } from '../scene';
import type { SpinePlaceConfig, SpineViewConfig } from '../viewConfig';
import {
  fitPlacement,
  missingAnimationMessage,
  missingSkinMessage,
  resolveStartTime,
  spineAliases,
} from './PixSpineStep';
import { loadSpineRuntime, type SpineRuntime } from './SpineRuntime';

export type SpineEventType = 'start' | 'interrupt' | 'end' | 'dispose' | 'complete' | 'event';
export type SpineEventInfo = {
  type: SpineEventType;
  track: number;
  animation: string;
  /** The name of the animation event (type 'event' only). */
  name?: string;
};

export type PlayOptions = {
  /** Default 0. */
  track?: number;
  loop?: boolean;
  /** Seconds to blend from the current animation. Default: the pair in the view's `mixes`, else its `defaultMix`. */
  mix?: number;
  /** Speed of this animation; 0 holds it on its first pose. Default 1. */
  timeScale?: number;
  /** Play backwards. Spine does not fire animation events (type 'event') in reverse; `complete` still fires. */
  reverse?: boolean;
  /** Where to start, in seconds along the playback direction (0 is the last pose when reversed). */
  startAt?: 'first' | 'last' | number;
  /** Play after the current animation of the track instead of replacing it. */
  queue?: boolean;
  /** Seconds to wait after the previous animation ends (queue only). */
  delay?: number;
};

/** The legacy playAnimation / prepareAnimation options. */
export type LegacyPlayOptions = { state?: string; loop?: boolean; stopAtFirst?: boolean; trackIndex?: number };

/** The view config plus the asset aliases, the shape the legacy class kept in `configData`. */
export type PixSpineConfig = SpineViewConfig & { skeleton: string; atlas: string };

export class PixSpine extends Container {
  protected configData: PixSpineConfig;
  protected anchor: { x: number; y: number };
  private spineAnim: Spine;
  /** Multiplier on playback speed for the whole skeleton (setAnimationSpeed). */
  private speed = 1;
  private readonly runtime: SpineRuntime;
  private readonly spineListeners = new Set<AnimationStateListener>();
  private readonly cleanups: Array<() => void> = [];
  private lastState: string | undefined;
  private held = false;

  /** Builds one from a view config. The stage must already hold its asset (PixiStage `spine`). */
  static async create(host: StageHost, view: SpineViewConfig): Promise<PixSpine> {
    const runtime = await loadSpineRuntime();
    return new PixSpine(runtime, host, view);
  }

  private constructor(runtime: SpineRuntime, host: StageHost, configData: SpineViewConfig) {
    super();
    this.runtime = runtime;
    this.configData = { ...configData, ...spineAliases(configData.asset) };
    this.spineAnim = runtime.Spine.from({ skeleton: this.configData.skeleton, atlas: this.configData.atlas });
    this.spineAnim.autoUpdate = false; // ticked below from the stage's ticker
    this.addChild(this.spineAnim);
    this.anchor = { x: 0.5, y: 0.5 };

    const data = this.spineAnim.state.data;
    data.defaultMix = this.configData.defaultMix ?? 0;
    for (const m of this.configData.mixes ?? []) data.setMix(m.from, m.to, m.duration);

    const tick = (t: Ticker) => {
      if (this.held || this.destroyed) return;
      this.spineAnim.update((Math.min(t.deltaMS, 100) / 1000) * this.speed);
    };
    host.app.ticker.add(tick);
    this.cleanups.push(() => host.app.ticker.remove(tick));
    // the stage stops everything it tracked on unmount, so a scene that forgets still leaks nothing
    const group = trackGroup(host.track);
    const destroyWithStage = () => this.destroy();
    group.add(destroyWithStage);
    this.cleanups.push(() => group.delete(destroyWithStage));

    if (this.configData.skin) this.setSkin(this.configData.skin);
    if (this.configData.defaultState) this.play(this.configData.defaultState, { loop: this.configData.loop });
    else this.spineAnim.update(0);
    if (this.configData.place) this.place(this.configData.place);
  }

  public setAnimationSpeed(num: number): void {
    this.speed = num;
  }

  /** One skin, or several combined (later names win). */
  setSkin(name: string | string[]): void {
    this.assertAlive();
    const data = this.spineAnim.skeleton.data;
    const found = (typeof name === 'string' ? [name] : name).map((n) => {
      const s = data.findSkin(n);
      if (!s)
        throw new Error(
          missingSkinMessage(
            n,
            data.skins.map((x) => x.name),
          ),
        );
      return s;
    });
    if (found.length === 1) this.spineAnim.skeleton.setSkin(found[0]);
    else {
      const combined: Skin = new this.runtime.Skin('combined');
      for (const s of found) combined.addSkin(s);
      this.spineAnim.skeleton.setSkin(combined);
    }
    this.spineAnim.skeleton.setSlotsToSetupPose();
    this.spineAnim.update(0);
  }

  /** The legacy addEventListener (renamed, see the header): `complete` gets (entry, this); `event` gets (event, this). Returns the unsubscribe. */
  addSpineListener(
    event: 'complete' | 'event',
    callback: (arg: TrackEntry | SpineEvent, self: PixSpine) => void,
  ): () => void {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const that: PixSpine = this;
    if (event === 'complete') {
      return this.subscribe({
        complete: function (entry) {
          if (!that.destroyed) callback(entry, that);
        },
      });
    }
    return this.subscribe({
      event: function (entry, event) {
        if (!that.destroyed) callback(event, that);
      },
    });
  }

  /** Subscribes to an animation state event; returns the unsubscribe. `name` filters `event` by animation event name. */
  listen(type: SpineEventType, callback: (info: SpineEventInfo) => void, name?: string): () => void {
    const handler = (entry: TrackEntry, event?: SpineEvent) => {
      if (this.destroyed) return;
      if (type === 'event' && name !== undefined && event?.data.name !== name) return;
      callback({ type, track: entry.trackIndex, animation: entry.animation?.name ?? '', name: event?.data.name });
    };
    return this.subscribe({ [type]: handler } as AnimationStateListener);
  }

  /** Removes every listener added through `addSpineListener` and `listen` (the legacy name keeps its spelling). */
  removeEventListners() {
    for (const listener of this.spineListeners) this.spineAnim.state.removeListener(listener);
    this.spineListeners.clear();
  }

  private subscribe(listener: AnimationStateListener): () => void {
    this.spineAnim.state.addListener(listener);
    this.spineListeners.add(listener);
    return () => {
      this.spineAnim.state.removeListener(listener);
      this.spineListeners.delete(listener);
    };
  }

  /** Plays an animation on a track. Returns the runtime's track entry (for callers that need more than this offers). */
  play(state: string, options: PlayOptions = {}): TrackEntry {
    this.assertAlive();
    const names = this.spineAnim.skeleton.data.animations.map((a) => a.name);
    if (!names.includes(state)) throw new Error(missingAnimationMessage(state, names));
    const track = options.track ?? 0;
    const animations = this.spineAnim.state;
    const entry = options.queue
      ? animations.addAnimation(track, state, !!options.loop, options.delay ?? 0)
      : animations.setAnimation(track, state, !!options.loop);
    if (options.mix !== undefined) entry.mixDuration = options.mix;
    entry.timeScale = options.timeScale ?? 1;
    entry.reverse = !!options.reverse;
    const at = resolveStartTime(options.startAt, entry.animationStart, entry.animationEnd);
    if (at !== undefined) entry.trackTime = at;
    this.lastState = state;
    this.held = false;
    if (!options.queue) this.spineAnim.update(0); // marks the pose dirty: it is applied at the next render, also when the animation is held
    return entry;
  }

  /** Clears every track and returns the skeleton to its setup pose. */
  reset(): void {
    this.assertAlive();
    this.spineAnim.state.clearTracks();
    this.spineAnim.skeleton.setToSetupPose();
    this.held = false;
    this.spineAnim.update(0);
  }

  clearTrack(track: number): void {
    this.assertAlive();
    this.spineAnim.state.clearTrack(track);
  }

  /** Blends a track out to nothing over `mix` seconds. */
  setEmptyAnimation(track = 0, mix = 0): void {
    this.assertAlive();
    this.spineAnim.state.setEmptyAnimation(track, mix);
  }

  public prepareAnimation(options: LegacyPlayOptions = {}) {
    return this.playAnimation({ ...options, stopAtFirst: true });
  }

  /** Reset to the setup pose, then play `state` (default: the view's `defaultState`). `stopAtFirst` holds the first pose. */
  public playAnimation(options: LegacyPlayOptions = {}) {
    const state = options.state ?? this.configData.defaultState;
    if (!state) throw new Error('PixSpine.playAnimation: no state given and the view has no defaultState');
    this.reset();
    return this.play(state, {
      track: options.trackIndex ?? 0,
      loop: options.loop,
      timeScale: options.stopAtFirst ? 0 : 1,
      startAt: options.stopAtFirst ? 'first' : undefined,
    });
  }

  /** Plays the current (or the given) animation backwards from its last pose. */
  public playReverseAnimation(state?: string, options: Omit<PlayOptions, 'reverse'> = {}) {
    const name = state ?? this.lastState ?? this.configData.defaultState;
    if (!name) throw new Error('PixSpine.playReverseAnimation: no animation to reverse yet; pass its name');
    return this.play(name, { ...options, reverse: true });
  }

  /** Drops queued animations and holds the current pose. A later play resumes. */
  stopAnimation() {
    this.assertAlive();
    for (const entry of this.spineAnim.state.tracks) if (entry) this.spineAnim.state.clearNext(entry);
    this.held = true;
  }

  /** Shows the named attachment in a slot, or nothing (null). */
  setAttachment(slot: string, attachment: string | null): void {
    this.assertAlive();
    this.spineAnim.skeleton.setAttachment(slot, attachment as string); // the runtime accepts null to clear
    this.spineAnim.update(0);
  }

  /** Puts a display object in a slot so it follows the bone. Removed with `detach`, or on destroy. */
  attach(slot: string, object: Container): void {
    this.assertAlive();
    this.spineAnim.addSlotObject(slot, object);
  }

  detach(slotOrObject: string | Container): void {
    this.spineAnim.removeSlotObject(slotOrObject);
  }

  /**
   * Positions and sizes the skeleton. With `fit` the skeleton is scaled into the box from its bounds *in the current
   * pose* (call after the pose you want to fit is showing) and the position is the centre of that box.
   */
  place(p: SpinePlaceConfig): void {
    this.assertAlive();
    let scale = p.scale ?? 1;
    let pivot = p.pivot ?? { x: 0, y: 0 };
    if (p.fit) {
      const b = this.spineAnim.getLocalBounds();
      const fitted = fitPlacement({ x: b.x, y: b.y, width: b.width, height: b.height }, p.fit);
      scale *= fitted.scale;
      pivot = fitted.pivot;
    }
    this.pivot.set(pivot.x, pivot.y);
    this.scale.set(scale * (p.flipX ? -1 : 1), scale * (p.flipY ? -1 : 1));
    this.position.set(p.x ?? 0, p.y ?? 0);
  }

  override destroy(options?: DestroyOptions): void {
    if (this.destroyed) return;
    this.removeEventListners();
    this.cleanups.splice(0).forEach((cleanup) => cleanup());
    super.destroy(options ?? { children: true }); // destroys the Spine object; textures belong to SpineAssets
  }

  private assertAlive() {
    if (this.destroyed) throw new Error('PixSpine is destroyed');
  }
  public getWidth(): number {
    if (this.configData.boundingBox) {
      return this.configData.boundingBox.width;
    } else {
      return this.width;
    }
  }
  public getHeight(): number {
    if (this.configData.boundingBox) {
      return this.configData.boundingBox.height;
    } else {
      return this.height;
    }
  }
}
