// React helpers for server-timed rounds. Everything here is DISPLAY: it re-renders on a timer so countdowns and
// "betting is open" indicators follow server time. It never changes round state or sends a request: the server
// enforces deadlines and decides outcomes.
import { useEffect, useMemo, useState } from 'react';

import { createServerClock, type ServerClock } from './serverClock.ts';

/** One server clock per screen. */
export const useServerClock = (): ServerClock => useMemo(() => createServerClock(), []);

/** The current server time, refreshed every `intervalMs` (default 100). */
export function useServerNow(clock: ServerClock, intervalMs = 100): number {
  const [now, setNow] = useState(() => clock.now());
  useEffect(() => {
    const id = setInterval(() => setNow(clock.now()), intervalMs);
    return () => clearInterval(id);
  }, [clock, intervalMs]);
  return now;
}

/**
 * Countdown to a server deadline: whole seconds left (rounded up, never below 0) and the fraction of the phase
 * that remains (1 at `startsAt`, 0 at `endsAt`). `endsAt` null means no deadline.
 */
export function useCountdown(clock: ServerClock, startsAt: number | null, endsAt: number | null, intervalMs = 100) {
  const now = useServerNow(clock, intervalMs);
  if (endsAt === null) return { secondsLeft: 0, progress: 0, remainingMs: 0 };
  const remainingMs = Math.max(0, endsAt - now);
  const span = startsAt === null ? 0 : Math.max(1, endsAt - startsAt);
  return {
    secondsLeft: Math.ceil(remainingMs / 1000),
    progress: span ? Math.min(1, remainingMs / span) : 0,
    remainingMs,
  };
}

/**
 * Calls `onReach` once when server time reaches `deadline`, scheduled from the server clock estimate (and
 * rescheduled if the estimate moves). This only moves the UI on; the server has already enforced the deadline.
 */
export function useAtServerTime(clock: ServerClock, deadline: number | null, onReach: () => void) {
  useEffect(() => {
    if (deadline === null) return;
    let id: ReturnType<typeof setTimeout>;
    const schedule = () => {
      const remaining = clock.remainingMs(deadline);
      if (remaining <= 0) return onReach();
      id = setTimeout(schedule, Math.min(remaining, 500)); // re-check often so a clock correction is picked up
    };
    schedule();
    return () => clearTimeout(id);
    // onReach is intentionally not a dependency: it is the latest closure at the time the deadline is reached
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clock, deadline]);
}
