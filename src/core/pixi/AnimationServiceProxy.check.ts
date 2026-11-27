// Self-check: node --experimental-strip-types --no-warnings src/core/pixi/AnimationServiceProxy.check.ts
// Easings, the tween engine on a fake ticker, cleanup, and the exact equivalents of the curves the games hand-wrote.
import assert from 'node:assert/strict';

import {
  AnimationProxy,
  ease,
  type EaseName,
  killTweensOf,
  resolveEase,
  tween,
  wait,
  window01,
} from './AnimationServiceProxy.ts';

type Fn = (t: { deltaMS: number }) => void;
function fakeStage() {
  const listeners = new Set<Fn>();
  const disposers: Array<() => void> = [];
  const host = {
    app: { ticker: { add: (fn: Fn) => void listeners.add(fn), remove: (fn: Fn) => void listeners.delete(fn) } },
    track: (d: () => void) => void disposers.push(d),
  };
  const step = (deltaMS: number) => [...listeners].forEach((fn) => fn({ deltaMS }));
  return { host, listeners, disposers, step };
}
const near = (a: number, b: number, msg: string) => assert.ok(Math.abs(a - b) < 1e-9, `${msg}: ${a} vs ${b}`);

// every curve starts at 0 and ends at 1
for (const name of Object.keys(ease) as EaseName[]) {
  near(ease[name](0), 0, `${name}(0)`);
  near(ease[name](1), 1, `${name}(1)`);
}
// the curves the games used to write by hand
for (const x of [0, 0.2, 0.5, 0.8, 1])
  near(
    ease.backOut(x),
    1 + 2.70158 * (x - 1) ** 3 + 1.70158 * (x - 1) ** 2,
    `backOut(${x}) matches the card reveal's easeOutBack`,
  );
near(window01(150, 100, 100), 0.5, 'window01 mid');
assert.equal(window01(50, 100, 100), 0);
assert.equal(window01(500, 100, 100), 1);

// old-framework ease names resolve; unknown names do not
const names: Record<string, EaseName | undefined> = {
  'Linear.easeOut': 'linear',
  'Linear.easeNone': 'linear',
  none: 'linear',
  'Sine.easeOut': 'sineOut',
  'sine.inOut': 'sineInOut',
  'Sine.easeInOut': 'sineInOut',
  'power1.out': 'power1Out',
  'power2.in': 'power2In',
  'power2.inOut': 'power2InOut',
  'power3.out': 'power3Out',
  'back.out': 'backOut',
  'Back.easeIn': 'backIn',
  'elastic.out': 'elasticOut',
  'Expo.easeOut': 'expoOut',
  'Expo.easeInOut': 'expoInOut',
  power2Out: 'power2Out',
  'power9.out': undefined,
  bogus: undefined,
};
for (const [from, to] of Object.entries(names)) assert.equal(resolveEase(from), to, `resolveEase("${from}")`);

// a plain tween: nested values, progress, completion, and the ticker callback removed when idle
{
  const { host, listeners, disposers, step } = fakeStage();
  const target = { x: 0, scale: { x: 1, y: 1 } };
  let completed = 0;
  let resolved = false;
  const h = tween(host, target, { x: 100, scale: { x: 2, y: 3 } }, { duration: 100, onComplete: () => completed++ });
  void h.done.then(() => (resolved = true));
  assert.equal(listeners.size, 1);
  step(25);
  near(target.x, 25, 'x at 25%');
  near(target.scale.y, 1.5, 'nested scale.y at 25%');
  step(75);
  near(target.x, 100, 'x at the end');
  assert.equal(completed, 1);
  step(16);
  assert.equal(listeners.size, 0, 'the ticker callback removes itself when no tween runs');
  assert.equal(completed, 1);
  await Promise.resolve();
  assert.ok(resolved, 'done resolves on completion');
  assert.equal(disposers.length, 1, 'one disposer per stage');
}

// delay: start values are read when the tween starts
{
  const { host, step } = fakeStage();
  const target = { x: 0 };
  tween(host, target, { x: 100 }, { duration: 100, delay: 50 });
  step(40);
  assert.equal(target.x, 0);
  target.x = 10;
  step(10 + 50); // delay ends, 50 ms of the tween elapse
  near(target.x, 10 + (100 - 10) * 0.5, 'tween starts from the value at the end of the delay');
}

// repeat and yoyo
{
  const { host, step } = fakeStage();
  const target = { x: 0 };
  tween(host, target, { x: 100 }, { duration: 100, repeat: 1 });
  step(100);
  near(target.x, 0, 'plain repeat restarts from the start values');
  step(100);
  near(target.x, 100, 'second play ends at the goal');

  const y = { x: 0 };
  tween(host, y, { x: 100 }, { duration: 100, repeat: 1, yoyo: true });
  step(100);
  near(y.x, 100, 'yoyo first play');
  step(50);
  near(y.x, 50, 'yoyo plays back');
  step(50);
  near(y.x, 0, 'yoyo ends at the start');
}

// the Acca Crash head pulse was |sin(t / period)|: a sineOut yoyo of period * PI / 2 ms is exactly that curve
{
  const { host, step } = fakeStage();
  const period = 220;
  const amount = 0.35;
  const head = { scale: { x: 1, y: 1 } };
  tween(
    host,
    head,
    { scale: { x: 1 + amount, y: 1 + amount } },
    {
      duration: (period * Math.PI) / 2,
      ease: 'sineOut',
      yoyo: true,
      repeat: -1,
    },
  );
  const dt = (period * Math.PI) / 2 / 20; // 20 steps per half period, so the turning points land on a step
  for (let i = 1; i <= 65; i++) {
    step(dt);
    near(head.scale.x, 1 + amount * Math.abs(Math.sin((i * dt) / period)), `pulse at step ${i}`);
  }
}

// stop: frozen, never completes, never resolves; stage teardown stops everything with one disposer
{
  const { host, listeners, disposers, step } = fakeStage();
  const a = { x: 0 };
  let completed = 0;
  let resolved = false;
  const h = tween(host, a, { x: 100 }, { duration: 100, onComplete: () => completed++ });
  void h.done.then(() => (resolved = true));
  step(50);
  h.stop();
  h.stop(); // safe twice
  step(50);
  near(a.x, 50, 'a stopped tween stays where it was');
  assert.equal(completed, 0);
  await Promise.resolve();
  assert.equal(resolved, false, 'done never resolves for a stopped tween');

  const many = Array.from({ length: 50 }, () => ({ x: 0 }));
  many.forEach((m) => tween(host, m, { x: 1 }, { duration: 1000 }));
  assert.equal(disposers.length, 1, '50 tweens still use one disposer');
  disposers.forEach((d) => d());
  step(16);
  assert.equal(listeners.size, 0, 'teardown stops every tween and the ticker callback goes');
  assert.ok(many.every((m) => m.x === 0));
}

// killTweensOf finds a tween by its target or by an object inside it, even before its delay ends
{
  const { host, step } = fakeStage();
  const t = { x: 0, scale: { x: 1 } };
  tween(host, t, { x: 10 }, { duration: 100 });
  tween(host, t, { scale: { x: 5 } }, { duration: 100, delay: 20 });
  step(10);
  killTweensOf(t);
  step(200);
  assert.equal(t.scale.x, 1, 'the delayed tween on t was killed too');
  const u = { scale: { x: 1 } };
  tween(host, u, { scale: { x: 5 } }, { duration: 100 });
  step(10);
  killTweensOf(u.scale);
  step(200);
  assert.ok(u.scale.x < 5, 'killing the nested object stops the tween');
}

// a destroyed target stops the tween instead of throwing
{
  const { host, listeners, step } = fakeStage();
  const t = { x: 0, destroyed: false };
  tween(host, t, { x: 10 }, { duration: 100 });
  step(10);
  t.destroyed = true;
  step(10);
  step(10);
  assert.equal(listeners.size, 0);
  assert.ok(t.x < 10);
}

// the old AnimationProxy method names: animateFromTo, delayedCall, killAll
{
  const { host, step } = fakeStage();
  const t = { x: 0 };
  AnimationProxy.animateFromTo(host, t, { x: 50 }, { x: 150 }, { duration: 100 });
  assert.equal(t.x, 50, 'animateFromTo sets the from value first');
  step(100);
  near(t.x, 150, 'animateFromTo reaches the goal');
  let called = 0;
  AnimationProxy.delayedCall(host, 30, () => called++);
  step(29);
  assert.equal(called, 0);
  step(1);
  assert.equal(called, 1);
  const w = { x: 0 };
  tween(host, w, { x: 1 }, { duration: 100 });
  wait(host, 100);
  AnimationProxy.killAll(host);
  step(200);
  assert.equal(w.x, 0, 'killAll stops everything this stage started');
}

console.log('AnimationServiceProxy.check: ok');
