// Keeps the client's view of a server-controlled round consistent when messages are delayed, duplicated, reordered or
// missed (reconnects). The server owns the round: it sends snapshots { roundId, phase, seq, phaseEndsAt }, and the
// tracker decides whether each snapshot may replace what the client currently shows. It never moves a round
// forward on its own and has no timers.
//
// A game chooses its own phases (`order`), the set of phases it uses and which are final. The vocabulary below is
// a convenience for live-round games; an instant-result game can use a subset or not use a tracker at all.

/** Optional shared vocabulary. Games may use any string phases. */
export type RoundPhase =
  | 'waiting' // the next round has not opened yet
  | 'bettingOpen'
  | 'bettingClosed'
  | 'running' // the round is in play (a crash multiplier climbing, a draw in progress)
  | 'cashout' // cash-out window, where the game has one separate from running
  | 'settling' // the server is settling bets
  | 'completed'
  | 'cancelled'
  | 'error';

/** Phase order for a live round. A round only moves forward through it. */
export const LIVE_ROUND_ORDER: RoundPhase[] = [
  'waiting',
  'bettingOpen',
  'bettingClosed',
  'running',
  'cashout',
  'settling',
  'completed',
];
/** An instant-result round skips the live part. */
export const INSTANT_ROUND_ORDER: RoundPhase[] = ['bettingOpen', 'settling', 'completed'];

export type RoundSnapshot<P extends string = RoundPhase> = {
  roundId: string;
  phase: P;
  /** Increases by one with every state the server publishes for this round. */
  seq: number;
  /** Server time at which this phase ends, when it has a deadline. */
  phaseEndsAt?: number | null;
};

export type ApplyResult<P extends string> =
  | { kind: 'applied'; snapshot: RoundSnapshot<P>; previous: RoundSnapshot<P> | null }
  | { kind: 'newRound'; snapshot: RoundSnapshot<P>; previous: RoundSnapshot<P> | null }
  | { kind: 'duplicate' } // the same snapshot again
  | { kind: 'stale' } // older than what is shown, or a round that is already over
  | { kind: 'invalid'; reason: string }; // contradicts the lifecycle: the game should resync from the server

type Options<P extends string> = {
  /** Phases in the order a round passes through them. Phases not listed are not allowed. */
  order: readonly P[];
  /** Phases after which a round never changes again. Default: completed and cancelled. */
  final?: readonly P[];
  /** Phases reachable from anywhere (default: cancelled and error): they are always allowed and need not be in `order`. */
  anytime?: readonly P[];
  /** How many finished rounds are remembered so that their late messages are ignored. Default 20. */
  remember?: number;
};

export type RoundTracker<P extends string> = {
  apply(snapshot: RoundSnapshot<P>): ApplyResult<P>;
  readonly current: RoundSnapshot<P> | null;
  /** True when this round is over (or was never seen as active) and should ignore further actions. */
  isFinished(roundId: string): boolean;
  reset(): void;
};

export function createRoundTracker<P extends string = RoundPhase>(options: Options<P>): RoundTracker<P> {
  const rank = new Map(options.order.map((phase, i) => [phase, i]));
  const phases = new Set<string>(options.order);
  const final = new Set<string>(options.final ?? ['completed', 'cancelled']);
  const anytime = new Set<string>(options.anytime ?? ['cancelled', 'error']);
  const remember = options.remember ?? 20;
  let current: RoundSnapshot<P> | null = null;
  const finished: string[] = [];

  const markFinished = (roundId: string) => {
    if (finished.includes(roundId)) return;
    finished.push(roundId);
    if (finished.length > remember) finished.shift();
  };

  return {
    apply(snapshot) {
      if (!phases.has(snapshot.phase) && !anytime.has(snapshot.phase))
        return { kind: 'invalid', reason: `unknown phase "${snapshot.phase}"` };

      if (!current || current.roundId !== snapshot.roundId) {
        if (finished.includes(snapshot.roundId)) return { kind: 'stale' }; // a late message of a round that is over
        const previous = current;
        if (previous && final.has(previous.phase)) markFinished(previous.roundId);
        current = snapshot;
        if (final.has(snapshot.phase)) markFinished(snapshot.roundId);
        return { kind: 'newRound', snapshot, previous };
      }

      if (snapshot.seq === current.seq) return { kind: 'duplicate' };
      if (snapshot.seq < current.seq) return { kind: 'stale' };
      if (final.has(current.phase)) return { kind: 'stale' }; // a finished round does not come back

      const from = rank.get(current.phase);
      const to = rank.get(snapshot.phase);
      const jump = anytime.has(snapshot.phase) || current.phase === 'error';
      if (!jump && from !== undefined && to !== undefined && to < from)
        return { kind: 'invalid', reason: `phase went back from "${current.phase}" to "${snapshot.phase}"` };

      const previous = current;
      current = snapshot;
      if (final.has(snapshot.phase)) markFinished(snapshot.roundId);
      return { kind: 'applied', snapshot, previous };
    },
    get current() {
      return current;
    },
    isFinished: (roundId) => finished.includes(roundId),
    reset() {
      current = null;
      finished.length = 0;
    },
  };
}
