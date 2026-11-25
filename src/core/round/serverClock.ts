// Server time on the client. Round deadlines (betting closes, round starts) are stamped by the server in server
// time; the browser only DISPLAYS countdowns derived from them. Nothing a browser timer does can open, close or
// settle a round: the server enforces every deadline and rejects late actions.
//
// How it works: every response that carries `serverTime` gives a sample of the offset between the server clock and
// this page's monotonic clock. The sample with the smallest round-trip time among the most recent ones is the most
// trustworthy (its one-way delay is the smallest, so its error is bounded by rtt / 2). Old samples roll off, so a
// drifting clock is followed. The monotonic clock is used, not Date.now(), so changes to the user's system clock do
// not matter. Plain TypeScript: used by React hooks and checked in Node.

export type ClockSample = {
  /** The server's time in the response, in ms (any epoch the server uses consistently for its deadlines). */
  serverTime: number;
  /** Client monotonic time when the request was sent. */
  requestedAt: number;
  /** Client monotonic time when the response arrived. */
  receivedAt: number;
};

export type ServerClock = {
  /** Records a sample. Responses with no usable timing are ignored. */
  observe(sample: ClockSample): void;
  /** Records the server time from a response whose request time is unknown (for example the boot's init). */
  observeApprox(serverTime: number): void;
  /** The current server time estimate, in ms. Before any sample it equals the client clock. */
  now(): number;
  /** Milliseconds until `serverDeadline` (negative once it has passed). Display only. */
  remainingMs(serverDeadline: number): number;
  /** The estimated server minus client offset, and the best round trip seen recently. */
  readonly offsetMs: number;
  readonly rttMs: number | null;
  readonly samples: number;
};

/** Client monotonic milliseconds: unaffected by the user changing the system clock. */
export const monotonicNow = (): number => performance.timeOrigin + performance.now();

type Options = {
  /** Replaces the client clock (tests). */
  clientNow?: () => number;
  /** How many recent samples are kept; the best of these is used. Default 8. */
  window?: number;
};

export function createServerClock({ clientNow = monotonicNow, window = 8 }: Options = {}): ServerClock {
  const recent: Array<{ offset: number; rtt: number }> = [];

  // lowest round trip wins; on a tie the most recent sample, so a drifting clock is followed
  const best = () => recent.reduce((a, b) => (b.rtt <= a.rtt ? b : a));

  const clock: ServerClock = {
    observe({ serverTime, requestedAt, receivedAt }) {
      const rtt = receivedAt - requestedAt;
      if (!Number.isFinite(serverTime) || !Number.isFinite(rtt) || rtt < 0) return;
      // the server stamped its time about half way through the round trip
      recent.push({ offset: serverTime - (requestedAt + rtt / 2), rtt });
      if (recent.length > window) recent.shift();
    },
    observeApprox(serverTime) {
      const at = clientNow();
      // an approximate sample is only used until a measured one exists (its rtt is treated as large)
      if (!recent.length) this.observe({ serverTime, requestedAt: at - 1000, receivedAt: at });
    },
    now: () => clientNow() + (recent.length ? best().offset : 0),
    remainingMs: (deadline) => deadline - clock.now(),
    get offsetMs() {
      return recent.length ? best().offset : 0;
    },
    get rttMs() {
      return recent.length ? best().rtt : null;
    },
    get samples() {
      return recent.length;
    },
  };
  return clock;
}

/**
 * Runs a request and records the server time of its response, so every call keeps the clock in sync.
 * `serverTimeOf` picks the server time out of the response (a game's own response shape).
 */
export async function timed<T>(
  clock: ServerClock,
  call: () => Promise<T>,
  serverTimeOf: (response: T) => number | undefined,
  clientNow: () => number = monotonicNow,
): Promise<T> {
  const requestedAt = clientNow();
  const response = await call();
  const serverTime = serverTimeOf(response);
  if (serverTime !== undefined) clock.observe({ serverTime, requestedAt, receivedAt: clientNow() });
  return response;
}
