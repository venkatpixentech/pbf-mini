// Tweens and easings for scenes, without an animation library (the equivalent of the old framework's
// AnimationServiceProxy, which wrapped gsap). Plain TypeScript (types only from Pixi), so it can be checked in
// Node. One shared ticker callback per Pixi Application drives every tween of its stage, and it removes itself
// when none is running. Every tween is stopped when the stage unmounts (through ctx.track).
// Durations are milliseconds. Ease names are camelCase ('power2Out'); the old gsap strings ('power2.out',
// 'Linear.easeOut') are accepted too, so configs written for the old framework port unchanged.
import { Logger, warnOnce } from '../utils/LoggerService.ts';

export type EaseName =
  | 'linear'
  | 'sineIn'
  | 'sineOut'
  | 'sineInOut'
  | 'power1In'
  | 'power1Out'
  | 'power1InOut'
  | 'power2In'
  | 'power2Out'
  | 'power2InOut'
  | 'power3In'
  | 'power3Out'
  | 'power3InOut'
  | 'backIn'
  | 'backOut'
  | 'expoIn'
  | 'expoOut'
  | 'expoInOut'
  | 'elasticOut';

const powIn = (n: number) => (t: number) => t ** n;
const powOut = (n: number) => (t: number) => 1 - (1 - t) ** n;
const powInOut = (n: number) => (t: number) => (t < 0.5 ? 2 ** (n - 1) * t ** n : 1 - (-2 * t + 2) ** n / 2);
const BACK = 1.70158;

/**
 * Easing curves on 0..1. `powerN` follows the usual animation-library naming: power1 is quadratic, power2 cubic,
 * power3 quartic.
 */
export const ease: Record<EaseName, (t: number) => number> = {
  linear: (t) => t,
  sineIn: (t) => 1 - Math.cos((t * Math.PI) / 2),
  sineOut: (t) => Math.sin((t * Math.PI) / 2),
  sineInOut: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
  power1In: powIn(2),
  power1Out: powOut(2),
  power1InOut: powInOut(2),
  power2In: powIn(3),
  power2Out: powOut(3),
  power2InOut: powInOut(3),
  power3In: powIn(4),
  power3Out: powOut(4),
  power3InOut: powInOut(4),
  backIn: (t) => (BACK + 1) * t ** 3 - BACK * t ** 2,
  backOut: (t) => 1 + (BACK + 1) * (t - 1) ** 3 + BACK * (t - 1) ** 2,
  expoIn: (t) => (t === 0 ? 0 : 2 ** (10 * t - 10)),
  expoOut: (t) => (t === 1 ? 1 : 1 - 2 ** (-10 * t)),
  expoInOut: (t) => (t === 0 || t === 1 ? t : t < 0.5 ? 2 ** (20 * t - 10) / 2 : (2 - 2 ** (-20 * t + 10)) / 2),
  elasticOut: (t) => (t === 0 || t === 1 ? t : 2 ** (-10 * t) * Math.sin(((10 * t - 0.75) * (2 * Math.PI)) / 3) + 1),
};

/**
 * An ease name as written in this framework ('power2Out') or in the old one ('power2.out', 'Sine.easeInOut',
 * 'Linear.easeOut', 'none'). Returns undefined for a name that matches no curve. Linear ignores in/out, as it did there.
 */
export function resolveEase(name: string): EaseName | undefined {
  if (name in ease) return name as EaseName;
  const m = /^(\w+)\.(?:ease)?(in|out|inout|none)$/i.exec(name);
  const family = m ? m[1].toLowerCase() : name.toLowerCase();
  if (family === 'none' || family === 'linear') return 'linear';
  if (!m) return undefined;
  const direction = { in: 'In', out: 'Out', inout: 'InOut', none: 'Out' }[m[2].toLowerCase()];
  const candidate = `${family}${direction}`;
  return candidate in ease ? (candidate as EaseName) : undefined;
}

/** Progress 0..1 of the window that starts at `from` ms and lasts `ms`, for a timeline driven by one elapsed clock. */
export const window01 = (t: number, from: number, ms: number) => Math.min(1, Math.max(0, (t - from) / ms));

// The two Pixi things motion uses, as structural types so a check can pass a fake ticker.
type TickFn = (t: { deltaMS: number }) => void;
type TickerLike = { add(fn: TickFn): unknown; remove(fn: TickFn): unknown };
export type MotionHost = { app: { ticker: TickerLike }; track(dispose: () => void): void };

export type TweenOptions = {
  /** Milliseconds. */
  duration: number;
  /** A curve name from `ease`, or an old-framework name such as 'power2.out'. Default linear. */
  ease?: EaseName | (string & {});
  /** Milliseconds to wait before the tween starts; start values are read when it does. */
  delay?: number;
  /** Extra plays after the first; -1 repeats until stopped. */
  repeat?: number;
  /** Play every other repeat backwards (the curve is mirrored too). */
  yoyo?: boolean;
  onUpdate?: () => void;
  onComplete?: () => void;
};

export type TweenHandle = {
  /** Stops where it is. Safe to call more than once and after the tween finished. */
  stop(): void;
  /** Resolves when the tween completes. It never resolves if the tween was stopped, so code waiting on a torn-down scene just ends. */
  done: Promise<void>;
};

/** Numbers to tween: a number, or a nested object of numbers (for example `scale: { x: 1, y: 1 }`). */
export type TweenTo = { [key: string]: number | TweenTo };

type Entry = { obj: Record<string, number>; key: string; from: number; to: number };

type Engine = { tweens: Set<Tween>; tick: TickFn; running: boolean };

type Tween = {
  engine: Engine;
  /** Removes this tween's stop callback from its stage group. */
  cleanup: () => void;
  target: object;
  to: TweenTo;
  entries: Entry[];
  duration: number;
  ease: (t: number) => number;
  delay: number;
  elapsed: number;
  started: boolean;
  forward: boolean;
  repeatLeft: number;
  yoyo: boolean;
  onUpdate?: () => void;
  onComplete?: () => void;
  resolve: () => void;
  stopped: boolean;
};

const engines = new WeakMap<object, Engine>();
// every object a tween writes to (the target and its nested objects) -> the tweens on it, for killTweensOf
const byObject = new WeakMap<object, Set<Tween>>();
// per owner (the stage's `track` function): the stop functions of everything it started, behind ONE disposer
const groups = new WeakMap<object, Set<() => void>>();

/**
 * One set of stop callbacks per stage, registered with a single `track` disposer, so a stage that starts thousands
 * of tweens or effects over its life does not pile up thousands of disposers.
 */
export function trackGroup(track: (dispose: () => void) => void): Set<() => void> {
  let group = groups.get(track);
  if (!group) {
    const created = new Set<() => void>();
    groups.set(track, created);
    track(() => {
      for (const stop of [...created]) stop();
      created.clear();
    });
    group = created;
  }
  return group;
}

function collect(obj: Record<string, unknown>, to: TweenTo, out: Entry[], seen: Set<object>) {
  seen.add(obj);
  for (const key of Object.keys(to)) {
    const goal = to[key];
    const current = obj[key];
    if (typeof goal === 'number') {
      if (typeof current !== 'number') warnOnce('motion', `cannot tween "${key}": the target value is not a number`);
      else out.push({ obj: obj as Record<string, number>, key, from: current, to: goal });
    } else if (current && typeof current === 'object') collect(current as Record<string, unknown>, goal, out, seen);
    else warnOnce('motion', `cannot tween "${key}": the target has no such object`);
  }
}

function release(tw: Tween) {
  tw.stopped = true;
  tw.engine.tweens.delete(tw);
  byObject.get(tw.target)?.delete(tw);
  for (const e of tw.entries) byObject.get(e.obj)?.delete(tw);
  tw.cleanup();
}

function apply(tw: Tween, p: number) {
  const k = tw.ease(tw.forward ? p : 1 - p);
  for (const e of tw.entries) e.obj[e.key] = e.from + (e.to - e.from) * k;
}

function engineFor(ticker: TickerLike): Engine {
  const existing = engines.get(ticker);
  if (existing) return existing;
  const engine: Engine = {
    tweens: new Set(),
    running: false,
    tick: (t) => {
      for (const tw of [...engine.tweens]) {
        if (tw.stopped) continue;
        if ((tw.target as { destroyed?: boolean }).destroyed) {
          release(tw); // the object went away mid-tween: nothing left to animate
          continue;
        }
        let dt = t.deltaMS;
        if (tw.delay > 0) {
          tw.delay -= dt;
          if (tw.delay > 0) continue;
          dt = -tw.delay; // time left over after the delay ran out
          tw.delay = 0;
        }
        if (!tw.started) {
          tw.started = true;
          const seen = new Set<object>();
          collect(tw.target as Record<string, unknown>, tw.to, tw.entries, seen);
          for (const obj of seen) {
            const set = byObject.get(obj) ?? new Set<Tween>();
            set.add(tw);
            byObject.set(obj, set);
          }
        }
        tw.elapsed += dt;
        const p = tw.duration <= 0 ? 1 : Math.min(1, tw.elapsed / tw.duration);
        apply(tw, p);
        tw.onUpdate?.();
        if (p < 1) continue;
        if (tw.repeatLeft !== 0) {
          if (tw.repeatLeft > 0) tw.repeatLeft -= 1;
          tw.elapsed = 0;
          if (tw.yoyo) tw.forward = !tw.forward;
          else apply(tw, 0); // plain repeat: back to the start values
          continue;
        }
        release(tw);
        tw.onComplete?.();
        tw.resolve();
      }
      if (!engine.tweens.size) {
        engine.running = false;
        ticker.remove(engine.tick);
      }
    },
  };
  engines.set(ticker, engine);
  return engine;
}

/**
 * Tweens numbers on `target` from their current values to `to`. Values are read when the tween starts (after its
 * delay). Stopped automatically when the stage unmounts or the target is destroyed.
 */
export function tween(host: MotionHost, target: object, to: TweenTo, opts: TweenOptions): TweenHandle {
  const engine = engineFor(host.app.ticker);
  const group = trackGroup(host.track);
  const easeName = resolveEase(opts.ease ?? 'linear');
  const easing = easeName && ease[easeName];
  if (!easing) Logger.warn('motion', `unknown ease "${opts.ease}", using linear`);
  let resolve!: () => void;
  const done = new Promise<void>((r) => (resolve = r));
  const tw: Tween = {
    engine,
    cleanup: () => group.delete(stop),
    target,
    to,
    entries: [],
    duration: opts.duration,
    ease: easing ?? ease.linear,
    delay: opts.delay ?? 0,
    elapsed: 0,
    started: false,
    forward: true,
    repeatLeft: opts.repeat ?? 0,
    yoyo: opts.yoyo ?? false,
    onUpdate: opts.onUpdate,
    onComplete: opts.onComplete,
    resolve,
    stopped: false,
  };
  function stop() {
    if (!tw.stopped) release(tw);
  }
  group.add(stop);
  // found by killTweensOf from the start, even while the delay is still running
  const set = byObject.get(target) ?? new Set<Tween>();
  set.add(tw);
  byObject.set(target, set);
  engine.tweens.add(tw);
  if (!engine.running) {
    engine.running = true;
    host.app.ticker.add(engine.tick);
  }
  return { stop, done };
}

/** Waits `ms` on the stage clock (it follows the stage's pause and teardown, unlike setTimeout). */
export function wait(host: MotionHost, ms: number): TweenHandle {
  return tween(host, {}, {}, { duration: ms });
}

/** Stops every running tween on `target` (and on the objects inside it, such as its `scale`). */
export function killTweensOf(target: object): void {
  for (const tw of [...(byObject.get(target) ?? [])]) release(tw);
}

/**
 * The old framework's AnimationProxy method names over the functions above, so call sites read the same.
 * Every method takes the stage host (the scene's `ctx`) first, which is what stops the animation on unmount.
 */
export const AnimationProxy = {
  animateTween: tween,
  /** Sets `from` on the target, then tweens to `to`. */
  animateFromTo(host: MotionHost, target: object, from: TweenTo, to: TweenTo, opts: TweenOptions): TweenHandle {
    const set = (obj: Record<string, unknown>, values: TweenTo) => {
      for (const key of Object.keys(values)) {
        const value = values[key];
        if (typeof value === 'number') obj[key] = value;
        else if (obj[key] && typeof obj[key] === 'object') set(obj[key] as Record<string, unknown>, value);
      }
    };
    set(target as Record<string, unknown>, from);
    return tween(host, target, to, opts);
  },
  /** Calls `fn` after `ms` on the stage clock. */
  delayedCall(host: MotionHost, ms: number, fn: () => void): TweenHandle {
    return tween(host, {}, {}, { duration: ms, onComplete: fn });
  },
  killTweensOf,
  /** Stops every tween and effect this stage started. */
  killAll(host: MotionHost): void {
    for (const stop of [...trackGroup(host.track)]) stop();
  },
};
