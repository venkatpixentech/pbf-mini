// Round phase sequencer shared by the games: it holds the current phase and moves to the next one when the game
// calls advance(). It has no timers and never reads the device clock: when a phase ends is decided by server time
// (core/round: useAtServerTime, useCountdown) or by the game itself (an animation finished). It never calls a
// backend and never decides an outcome (docs/01-ARCHITECTURE.md).

export type PhaseDef<P extends string> = { next: P };

export type PhaseChange<P extends string> = { from: P | null; to: P };

export class RoundEngine<P extends string> {
  private current: P | null = null;
  private listeners = new Set<(change: PhaseChange<P>) => void>();
  private readonly phases: Record<P, PhaseDef<P>>;
  private readonly initial: P;

  constructor(phases: Record<P, PhaseDef<P>>, initial: P) {
    this.phases = phases;
    this.initial = initial;
  }

  get phase(): P | null {
    return this.current;
  }

  on(listener: (change: PhaseChange<P>) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  start(): void {
    this.enter(this.initial);
  }

  /** Leave the current phase now. Ignored when stopped. */
  advance(): void {
    if (this.current !== null) this.enter(this.phases[this.current].next);
  }

  stop(): void {
    this.current = null;
  }

  private enter(to: P): void {
    const from = this.current;
    this.current = to;
    this.listeners.forEach((listener) => listener({ from, to }));
  }
}
