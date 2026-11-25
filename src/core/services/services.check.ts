// Self-check: node --experimental-strip-types --no-warnings src/core/services/services.check.ts
import assert from 'node:assert/strict';

import { compareMoney, formatMoney, roundMoney } from './money.ts';
import { type PhaseChange, RoundEngine } from './RoundEngine.ts';

// money
assert.equal(roundMoney(0.1 + 0.2), 0.3);
assert.equal(roundMoney(1.005), 1.01);
assert.equal(compareMoney(0.1 + 0.2, 0.3), 0);
assert.equal(compareMoney(10.5, 2), 1); // the string comparison bug class from PBF (defect D2 in the archived PBF audit)
assert.equal(formatMoney(1234.5), '£1,234.50');

// round engine: timed phases advance by themselves, untimed ones wait, stop clears timers
type P = 'bet' | 'locked' | 'reveal';
const seen: string[] = [];
const engine = new RoundEngine<P>(
  { bet: { durationMs: 20, next: 'locked' }, locked: { durationMs: 20, next: 'reveal' }, reveal: { next: 'bet' } },
  'bet',
);
const off = engine.on((c: PhaseChange<P>) => seen.push(`${c.from}>${c.to}`));
engine.start();
await new Promise((r) => setTimeout(r, 80));
assert.deepEqual(seen, ['null>bet', 'bet>locked', 'locked>reveal'], 'timed phases advance, reveal waits');
assert.equal(engine.phase, 'reveal');
assert.equal(engine.phaseEndsAt, null);
engine.advance();
assert.equal(engine.phase, 'bet');
engine.stop();
await new Promise((r) => setTimeout(r, 40));
assert.equal(engine.phase, null, 'stop cancels the pending timer');
off();
engine.start();
assert.equal(seen.length, 4, 'unsubscribed listener is not called');
engine.stop();

console.log('services.check: ok');
