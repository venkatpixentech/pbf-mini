// MOCK ONLY: a server clock for mock backends. It has a deliberate offset from the client's clock (a real server's
// clock is never the same as the player's), so the client's clock synchronisation is exercised in mock mode exactly
// as it will be against a real backend. Real backends use their own clock; this file is not used by them.

export type MockServerClock = {
  /** Server time in ms. */
  now(): number;
  readonly skewMs: number;
};

type Options = {
  /** How far the mock server clock is ahead of the client (negative: behind). Default 7300 ms. */
  skewMs?: number;
  /** The client clock the skew is applied to (tests inject a fake). Default Date.now. */
  base?: () => number;
};

export function createMockServerClock({ skewMs = 7300, base = Date.now }: Options = {}): MockServerClock {
  return { now: () => base() + skewMs, skewMs };
}
