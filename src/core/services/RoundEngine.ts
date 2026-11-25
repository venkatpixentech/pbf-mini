// Timed round phase machine shared by all games. It owns phases and timers only:
// it never calls a backend and never decides an outcome (docs/01-ARCHITECTURE.md).

export type PhaseDef<P extends string> = {
  /** Auto-advance after this many ms. Omit for phases that wait for advance() (e.g. "animation done"). */
  durationMs?: number;
  next: P;
};

export type PhaseChange<P extends string> = { from: P | null; to: P; endsAt: number | null };

export class RoundEngine<P extends string> {
  private current: P | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private endsAt: number | null = null;
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

  get phaseEndsAt(): number | null {
    return this.endsAt;
  }

  on(listener: (change: PhaseChange<P>) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  start(): void {
    this.enter(this.initial);
  }

  /** Leave the current phase now (timer or manual). Ignored when stopped. */
  advance(): void {
    if (this.current !== null) this.enter(this.phases[this.current].next);
  }

  stop(): void {
    this.clear();
    this.current = null;
    this.endsAt = null;
  }

  private enter(to: P): void {
    this.clear();
    const from = this.current;
    const { durationMs } = this.phases[to];
    this.current = to;
    this.endsAt = durationMs === undefined ? null : Date.now() + durationMs;
    if (durationMs !== undefined) this.timer = setTimeout(() => this.advance(), durationMs);
    this.listeners.forEach((listener) => listener({ from, to, endsAt: this.endsAt }));
  }

  private clear(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }
}
