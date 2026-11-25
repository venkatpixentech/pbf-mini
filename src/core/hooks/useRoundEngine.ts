import { useEffect, useRef, useState } from 'react';

import { type PhaseChange, type PhaseDef, RoundEngine } from 'core/services/RoundEngine';

/**
 * Runs a RoundEngine for a screen: starts on mount, stops on unmount, exposes the phase and a live countdown.
 * `onPhase` is the game's handler; it may change between renders without resubscribing.
 */
export function useRoundEngine<P extends string>(
  phases: Record<P, PhaseDef<P>>,
  initial: P,
  onPhase: (change: PhaseChange<P>, engine: RoundEngine<P>) => void,
) {
  const [engine] = useState(() => new RoundEngine(phases, initial));
  const [phase, setPhase] = useState<P | null>(null);
  const [endsAt, setEndsAt] = useState<number | null>(null);
  const [now, setNow] = useState(0);
  const handler = useRef(onPhase);
  useEffect(() => {
    handler.current = onPhase;
  });

  useEffect(() => {
    const off = engine.on((change) => {
      setPhase(change.to);
      setEndsAt(change.endsAt);
      setNow(Date.now());
      handler.current(change, engine);
    });
    engine.start();
    return () => {
      off();
      engine.stop();
    };
  }, [engine]);

  useEffect(() => {
    if (!endsAt) return;
    const id = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(id);
  }, [endsAt]);

  const remainingMs = endsAt ? Math.max(0, endsAt - now) : 0;
  const durationMs = phase ? phases[phase].durationMs : undefined;
  return {
    engine,
    phase,
    secondsLeft: Math.ceil(remainingMs / 1000),
    /** 1 at the start of a timed phase, 0 at its end. */
    progress: durationMs ? remainingMs / durationMs : 0,
  };
}
