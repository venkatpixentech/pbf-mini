// Self-check for the boot load queue: node --experimental-strip-types src/core/boot/loadQueue.check.ts
import { LoadError, runQueue, withTimeout } from './loadQueue.ts';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const assert = (ok: boolean, msg: string) => {
  if (!ok) throw new Error('loadQueue.check: ' + msg);
};

// 1. bounded concurrency, de-duplication, progress
{
  let active = 0;
  let peak = 0;
  const calls: string[] = [];
  const progress: number[] = [];
  const keys = ['a', 'b', 'c', 'a', 'd', 'e', 'f', 'g', 'b'];
  const out = await runQueue(
    keys,
    async (k) => {
      calls.push(k);
      active++;
      peak = Math.max(peak, active);
      await sleep(10);
      active--;
      return k.toUpperCase();
    },
    { concurrency: 3, onProgress: (done) => progress.push(done) },
  );
  assert(peak === 3, `peak concurrency ${peak}, expected 3`);
  assert(calls.length === 7, `deduplicated calls ${calls.length}, expected 7`);
  assert(out.get('g') === 'G' && out.size === 7, 'results');
  assert(progress.join() === '1,2,3,4,5,6,7', `progress ${progress.join()}`);
}

// 2. retry after a transient failure
{
  let n = 0;
  const out = await runQueue(['x'], async () => {
    if (n++ === 0) throw new Error('transient');
    return 1;
  });
  assert(n === 2 && out.get('x') === 1, 'retry once');
}

// 3. timeout on every attempt -> LoadError TIMEOUT, no further items started
{
  const started: string[] = [];
  let error: unknown;
  try {
    await runQueue(
      ['slow', 'later'],
      async (k) => {
        started.push(k);
        if (k === 'slow') await sleep(1000);
        return k;
      },
      { concurrency: 1, timeoutMs: 20, retries: 1 },
    );
  } catch (e) {
    error = e;
  }
  assert(error instanceof LoadError && error.code === 'TIMEOUT' && error.key === 'slow', 'timeout error');
  assert(started.join() === 'slow,slow', `attempts ${started.join()}`);
}

// 4. permanent failure -> LoadError FAILED with the key
{
  let error: unknown;
  try {
    await runQueue(['bad'], async () => Promise.reject(new Error('404')), { retries: 2 });
  } catch (e) {
    error = e;
  }
  assert(error instanceof LoadError && error.code === 'FAILED' && error.key === 'bad', 'failed error');
}

// 5. abort
{
  const ac = new AbortController();
  const p = runQueue(['a', 'b'], async () => sleep(50), { signal: ac.signal });
  ac.abort();
  let error: unknown;
  try {
    await p;
  } catch (e) {
    error = e;
  }
  assert(error instanceof LoadError && error.code === 'ABORTED', 'abort');
}

// 6. withTimeout passes values through and rejects late ones
{
  assert((await withTimeout(Promise.resolve(5), 50, 'v')) === 5, 'withTimeout value');
  let error: unknown;
  try {
    await withTimeout(sleep(100), 10, 'late');
  } catch (e) {
    error = e;
  }
  assert(error instanceof LoadError && error.code === 'TIMEOUT', 'withTimeout timeout');
}

// 7. empty list resolves
assert((await runQueue([], async () => 1)).size === 0, 'empty');

console.log('loadQueue.check: ok (concurrency, dedupe, progress, retry, timeout, failure, abort)');
process.exit(0);
