// Self-check: node --experimental-strip-types --no-warnings src/core/pixi/wrapper/SpineAssets.check.ts
// Spine asset ownership: sharing, release, unmount while loading, failed loads, re-acquire during unload.
import assert from 'node:assert/strict';

import type { SpineAssetDef } from '../viewConfig.ts';
import { createSpineAssets, type SpineBackend } from './SpineAssets.ts';

const A: SpineAssetDef = { id: 'a', skeleton: 'a.json', atlas: 'a.atlas' };
const B: SpineAssetDef = { id: 'b', skeleton: 'b.skel', atlas: 'b.atlas' };

type Gate = { promise: Promise<void>; open(): void; fail(e: Error): void };
const gate = (): Gate => {
  let open!: () => void;
  let fail!: (e: Error) => void;
  const promise = new Promise<void>((res, rej) => {
    open = res;
    fail = rej;
  });
  return { promise, open, fail };
};
const tick = () => new Promise<void>((r) => setTimeout(r, 0));

/** A backend that records every call and lets a test hold loads open. */
function fake(opts: { hold?: Gate; failLoads?: number } = {}) {
  const log: string[] = [];
  let failLoads = opts.failLoads ?? 0;
  const backend: SpineBackend = {
    async ensureRuntime() {
      log.push('runtime');
    },
    async load(d) {
      log.push(`load:${d.id}`);
      if (opts.hold) await opts.hold.promise;
      if (failLoads > 0) {
        failLoads--;
        throw new Error('network');
      }
      log.push(`loaded:${d.id}`);
    },
    async unload(d) {
      log.push(`unload:${d.id}`);
    },
  };
  return { backend, log };
}

// two leases share one load; the asset unloads only after the last release
{
  const { backend, log } = fake();
  const spine = createSpineAssets(backend);
  const one = spine.acquire([A]);
  const two = spine.acquire([A]);
  await Promise.all([one.ready, two.ready]);
  assert.deepEqual(log, ['runtime', 'load:a', 'loaded:a']);
  assert.deepEqual(spine.stats(), { a: { refs: 2, loaded: true } });
  one.release();
  await tick();
  assert.ok(!log.includes('unload:a'), 'one lease still holds the asset');
  assert.deepEqual(spine.stats().a, { refs: 1, loaded: true });
  two.release();
  await tick();
  assert.equal(log.at(-1), 'unload:a');
  assert.deepEqual(spine.stats().a, { refs: 0, loaded: false });
  one.release(); // release is idempotent
  two.release();
  await tick();
  assert.equal(log.filter((l) => l === 'unload:a').length, 1);
}

// the runtime is requested before the first load of every asset
{
  const { backend, log } = fake();
  const spine = createSpineAssets(backend);
  await spine.acquire([A, B]).ready;
  assert.ok(log.indexOf('runtime') < log.indexOf('load:a') && log.indexOf('runtime') < log.indexOf('load:b'));
}

// release while loading: the unload waits for the load to settle, and never runs in the middle of it
{
  const hold = gate();
  const { backend, log } = fake({ hold });
  const spine = createSpineAssets(backend);
  const lease = spine.acquire([A]);
  await tick();
  assert.deepEqual(log, ['runtime', 'load:a']);
  lease.release(); // the scene unmounted during loading
  await tick();
  assert.ok(!log.includes('unload:a'), 'must not unload while the load is in flight');
  hold.open();
  await lease.ready;
  await tick();
  assert.deepEqual(log, ['runtime', 'load:a', 'loaded:a', 'unload:a']);
  assert.deepEqual(spine.stats().a, { refs: 0, loaded: false });
}

// released before its load even starts: nothing is loaded or unloaded
{
  const { backend, log } = fake();
  const spine = createSpineAssets(backend);
  const first = spine.acquire([B]);
  const lease = spine.acquire([A]);
  lease.release();
  await first.ready;
  await tick();
  assert.ok(!log.some((l) => l.endsWith(':a')), `asset a was touched: ${log.join(',')}`);
}

// a failed load rejects `ready`, is cleaned up on release, and a later acquire loads again
{
  const { backend, log } = fake({ failLoads: 1 });
  const spine = createSpineAssets(backend);
  const bad = spine.acquire([A]);
  await assert.rejects(bad.ready, /network/);
  assert.deepEqual(spine.stats().a, { refs: 1, loaded: false });
  bad.release();
  await tick();
  assert.equal(log.at(-1), 'unload:a', 'a partial load is cleaned up');
  const retry = spine.acquire([A]);
  await retry.ready;
  assert.deepEqual(spine.stats().a, { refs: 1, loaded: true });
  assert.equal(log.filter((l) => l === 'loaded:a').length, 1);
}

// acquire while a release is pending reuses the loaded asset (no reload, no unload)
{
  const { backend, log } = fake();
  const spine = createSpineAssets(backend);
  const one = spine.acquire([A]);
  await one.ready;
  one.release();
  const two = spine.acquire([A]); // same tick: the unload has not run yet
  await two.ready;
  await tick();
  assert.ok(!log.includes('unload:a'));
  assert.equal(log.filter((l) => l === 'loaded:a').length, 1);
}

// acquire while an unload is already running loads again after it finishes
{
  const { backend, log } = fake();
  const slow = gate();
  const orig = backend.unload;
  backend.unload = async (d) => {
    log.push(`unload-start:${d.id}`);
    await slow.promise;
    await orig(d);
  };
  const spine = createSpineAssets(backend);
  const one = spine.acquire([A]);
  await one.ready;
  one.release();
  await tick();
  assert.equal(log.at(-1), 'unload-start:a');
  const two = spine.acquire([A]);
  await tick();
  assert.ok(!log.slice(log.indexOf('unload-start:a')).includes('load:a'), 'must wait for the unload');
  slow.open();
  await two.ready;
  assert.deepEqual(log.slice(-4), ['unload:a', 'runtime', 'load:a', 'loaded:a']);
  assert.deepEqual(spine.stats().a, { refs: 1, loaded: true });
}

// an unload failure is reported and does not break later use
{
  const { backend } = fake();
  const errors: string[] = [];
  backend.unload = async () => {
    throw new Error('boom');
  };
  const spine = createSpineAssets(backend, (id) => errors.push(id));
  const lease = spine.acquire([A]);
  await lease.ready;
  lease.release();
  await tick();
  assert.deepEqual(errors, ['a']);
  assert.deepEqual(spine.stats().a, { refs: 0, loaded: false });
  await spine.acquire([A]).ready;
  assert.equal(spine.stats().a.loaded, true);
}

// the same id with different files is rejected while in use, and duplicate ids in one call collapse
{
  const { backend } = fake();
  const spine = createSpineAssets(backend);
  const lease = spine.acquire([A, A]);
  assert.deepEqual(lease.ids, ['a']);
  assert.equal(spine.stats().a.refs, 1);
  assert.throws(() => spine.acquire([{ ...A, atlas: 'other.atlas' }]), /already in use/);
  assert.throws(() => spine.acquire([A, { ...A, skeleton: 'x.json' }]), /declared twice/);
  assert.equal(spine.stats().a.refs, 1, 'a rejected acquire takes no reference');
  await lease.ready;
}

console.log('SpineAssets.check: ok');
