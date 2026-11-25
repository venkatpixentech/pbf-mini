// Renderer-independent loading helpers: timeout, retry, bounded concurrency, de-duplication, cancellation.
// Used by the boot for fonts and session init, and by core/pixi/preload for Pixi assets.

export type LoadErrorCode = 'TIMEOUT' | 'FAILED' | 'ABORTED';

export class LoadError extends Error {
  code: LoadErrorCode;
  key: string;
  /** The underlying error, if any. */
  detail: unknown;
  constructor(code: LoadErrorCode, key: string, cause?: unknown) {
    super(`${code}: ${key}`);
    this.detail = cause;
    this.code = code;
    this.key = key;
  }
}

/** Rejects with LoadError('TIMEOUT') if `promise` has not settled after `ms`. The underlying work is not stopped. */
export function withTimeout<T>(promise: Promise<T>, ms: number, key: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new LoadError('TIMEOUT', key)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

export type QueueOptions = {
  /** Parallel requests. Browsers allow about 6 per host on HTTP/1.1, so more only queues in the browser. */
  concurrency?: number;
  timeoutMs?: number;
  /** Extra attempts after a failure or timeout (transient network errors). */
  retries?: number;
  signal?: AbortSignal;
  /** Called after each item finishes, with the number done and the total. */
  onProgress?: (done: number, total: number) => void;
};

/**
 * Runs `load(key)` for every distinct key with bounded concurrency, a per-attempt timeout and retries.
 * Resolves when all succeed; rejects with LoadError on the first item that fails all its attempts
 * (remaining items are not started), or with LoadError('ABORTED') when `signal` aborts.
 */
export function runQueue<T>(
  keys: string[],
  load: (key: string) => Promise<T>,
  { concurrency = 6, timeoutMs = 15000, retries = 1, signal, onProgress }: QueueOptions = {},
): Promise<Map<string, T>> {
  const unique = [...new Set(keys)];
  const results = new Map<string, T>();
  let next = 0;
  let done = 0;
  let failed = false;
  return new Promise((resolve, reject) => {
    // an already-aborted signal never fires 'abort' again, so check it before starting any work
    if (signal?.aborted) return reject(new LoadError('ABORTED', 'queue'));
    if (!unique.length) return resolve(results);
    const fail = (error: unknown) => {
      if (failed) return;
      failed = true;
      reject(error);
    };
    signal?.addEventListener('abort', () => fail(new LoadError('ABORTED', 'queue')), { once: true });
    const attempt = async (key: string) => {
      for (let i = 0; ; i++) {
        try {
          return await withTimeout(load(key), timeoutMs, key);
        } catch (error) {
          if (i >= retries || signal?.aborted)
            throw error instanceof LoadError ? error : new LoadError('FAILED', key, error);
        }
      }
    };
    const worker = async () => {
      while (!failed && next < unique.length) {
        const key = unique[next++];
        try {
          results.set(key, await attempt(key));
        } catch (error) {
          return fail(error);
        }
        done += 1;
        if (!failed) onProgress?.(done, unique.length);
      }
      if (!failed && done === unique.length) resolve(results);
    };
    for (let i = 0; i < Math.min(concurrency, unique.length); i++) void worker();
  });
}
