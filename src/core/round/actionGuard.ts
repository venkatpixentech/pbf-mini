// Duplicate-action and retry protection for requests that move money (placing a bet, cashing out). Two parts:
//
//  1. ActionGuard: while an action with the same name is in flight, a second call (a double click, a re-render)
//     returns the SAME promise instead of sending another request.
//  2. retryWithSameKey: a retry after a timeout or a lost reply re-sends the request with the SAME request id, so a
//     backend that honours the id (idempotency key) applies the action once. A retry with a fresh id would risk
//     placing the same bet twice, which is why the id is created once per action, outside the retry loop.
//
// Whether to retry, how often and when to give up is the game's own policy (passed in). Whether the backend
// honours the id is a backend decision (docs/09-BACKEND-INTEGRATION.md); this file only guarantees the client side.

export const newRequestId = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;

export type RetryPolicy = {
  /** Total attempts including the first. Default 3. */
  attempts?: number;
  /** Wait before attempt n (1-based retry number). Default 300 ms, doubling. */
  delayMs?: (retry: number) => number;
  /** Which errors are worth retrying (default: none, so the caller must opt in, for example network errors). */
  shouldRetry?: (error: unknown) => boolean;
  sleep?: (ms: number) => Promise<void>;
};

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Calls `send(requestId)` and retries failures `shouldRetry` accepts, always with the same request id. */
export async function retryWithSameKey<T>(
  send: (requestId: string) => Promise<T>,
  { attempts = 3, delayMs = (n) => 300 * 2 ** (n - 1), shouldRetry = () => false, sleep = wait }: RetryPolicy = {},
  requestId: string = newRequestId(),
): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await send(requestId);
    } catch (error) {
      if (attempt >= attempts || !shouldRetry(error)) throw error;
      await sleep(delayMs(attempt));
    }
  }
}

export type ActionGuard = {
  /** Runs `action(requestId)` unless the same `name` is already running, in which case the running one is returned. */
  run<T>(name: string, action: (requestId: string) => Promise<T>): Promise<T>;
  pending(name: string): boolean;
};

export function createActionGuard(makeId: () => string = newRequestId): ActionGuard {
  const inFlight = new Map<string, Promise<unknown>>();
  return {
    run<T>(name: string, action: (requestId: string) => Promise<T>): Promise<T> {
      const running = inFlight.get(name);
      if (running) return running as Promise<T>;
      const promise = action(makeId()).finally(() => inFlight.delete(name));
      inFlight.set(name, promise);
      return promise;
    },
    pending: (name) => inFlight.has(name),
  };
}
