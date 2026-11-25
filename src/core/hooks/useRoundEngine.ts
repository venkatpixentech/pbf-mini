import { useEffect, useRef, useState } from 'react';

import { type PhaseChange, type PhaseDef, RoundEngine } from 'core/services/RoundEngine';

/**
 * Runs a RoundEngine for a screen: starts on mount, stops on unmount, exposes the current phase.
 * Countdowns come from server time (core/round: useCountdown), never from this hook.
 * `onPhase` is the game's handler; it may change between renders without resubscribing.
 */
export function useRoundEngine<P extends string>(
  phases: Record<P, PhaseDef<P>>,
  initial: P,
  onPhase: (change: PhaseChange<P>, engine: RoundEngine<P>) => void,
) {
  const [engine] = useState(() => new RoundEngine(phases, initial));
  const [phase, setPhase] = useState<P | null>(null);
  const handler = useRef(onPhase);
  useEffect(() => {
    handler.current = onPhase;
  });

  useEffect(() => {
    const off = engine.on((change) => {
      setPhase(change.to);
      handler.current(change, engine);
    });
    engine.start();
    return () => {
      off();
      engine.stop();
    };
  }, [engine]);

  return { engine, phase };
}
