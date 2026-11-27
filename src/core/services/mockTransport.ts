// MOCK ONLY: simulated network replies shared by the games' mock backends. Not used by real backends.
import { ApiError } from './apiError.ts';

export function mockTransport(latencyMs: number) {
  // 0 resolves on the microtask queue (used by the self-check simulations)
  const later = (fn: () => void) => (latencyMs > 0 ? setTimeout(fn, latencyMs) : queueMicrotask(fn));
  return {
    reply: <T>(value: T): Promise<T> => new Promise((resolve) => later(() => resolve(value))),
    fail: <C extends string>(code: C): Promise<never> =>
      new Promise((_, reject) => later(() => reject(new ApiError(code)))),
  };
}

/** MOCK ONLY: `?mockInitError=MAINTENANCE` (or SESSION_EXPIRED / SESSION_INVALID) makes a mock init fail. */
export function mockInitError(): 'MAINTENANCE' | 'SESSION_EXPIRED' | 'SESSION_INVALID' | null {
  const value = new URLSearchParams(window.location.search).get('mockInitError');
  return value === 'MAINTENANCE' || value === 'SESSION_EXPIRED' || value === 'SESSION_INVALID' ? value : null;
}

/** MOCK ONLY: `?mockSeed=7` makes a mock backend's random numbers repeatable (browser tests); without it, `Math.random`. */
export function mockRandom(): () => number {
  const raw = new URLSearchParams(window.location.search).get('mockSeed');
  const seed = raw !== null && /^\d{1,9}$/.test(raw) ? Number(raw) : null;
  if (seed === null) return Math.random;
  let state = seed;
  return () => (state = (state * 1664525 + 1013904223) % 2 ** 32) / 2 ** 32;
}
