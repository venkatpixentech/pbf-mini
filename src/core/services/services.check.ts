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

// roundMoney policy: 2 decimals, half away from zero, same rule for both signs, never -0
const same = (got: number, want: number, label: string) =>
  assert.ok(Object.is(got, want), `${label}: got ${got}, want ${want}`);
for (const [input, want] of [
  [0, 0],
  [-0, 0],
  [0.001, 0],
  [-0.001, 0],
  [0.004, 0],
  [-0.004, 0],
  [0.005, 0.01],
  [-0.005, -0.01],
  [1.005, 1.01],
  [-1.005, -1.01],
  [1.015, 1.02],
  [2.175, 2.18],
  [-2.175, -2.18],
  [2.675, 2.68],
  [4.765, 4.77],
  [10.005, 10.01],
  [1e-7, 0],
  [-1e-7, 0],
  [1e9 + 0.005, 1000000000.01],
  [123456789.125, 123456789.13],
  [9007199254740.99, 9007199254740.99],
  [1e21, 1e21],
  [1.5 * 1.45, 2.18], // stake x multiplier gives half-cents
] as Array<[number, number]>)
  same(roundMoney(input), want, `roundMoney(${input})`);
assert.ok(Number.isNaN(roundMoney(NaN)));
assert.equal(roundMoney(Infinity), Infinity);
assert.equal(roundMoney(-Infinity), -Infinity);
// sweep: every whole cent, half-cent and just-below-half-cent, both signs, across all magnitudes up to 10 million
for (let c = -1_000_000_000; c <= 1_000_000_000; c += 9973) {
  const away = c >= 0 ? c + 1 : c - 1;
  same(roundMoney(Number(`${c}e-2`)), Number(`${c}e-2`) || 0, `cent ${c}`);
  same(roundMoney(Number(`${c}.5e-2`)), Number(`${away}e-2`), `half-cent ${c}.5`);
  same(roundMoney(Number(`${c}.4999e-2`)), Number(`${c}e-2`) || 0, `below half-cent ${c}.4999`);
}
// dense near zero: every 0.0001 from -20 to 20
for (let k = -200_000; k <= 200_000; k++) {
  const cents = Math.trunc(k / 100) + (Math.abs(k) % 100 >= 50 ? Math.sign(k) : 0);
  same(roundMoney(Number(`${k}e-4`)), Number(`${cents}e-2`) || 0, `${k}e-4`);
}

// formatMoney: currencies Intl supports look exactly as Intl formats them; other codes never throw
for (const locale of ['en-GB', 'de-DE'])
  for (const currency of ['GBP', 'EUR', 'USD', 'JPY', 'FUN', 'gbp'])
    assert.equal(
      formatMoney(1234.5, currency, locale),
      new Intl.NumberFormat(locale, { style: 'currency', currency }).format(1234.5),
      `${currency} in ${locale}`,
    );
const quietWarn = console.warn;
console.warn = () => {}; // the one-time warnings for unknown codes are expected here
assert.equal(formatMoney(1234.5, 'USDT'), '1,234.50 USDT');
assert.equal(formatMoney(0.5, 'mBTC'), '0.50 mBTC');
assert.equal(formatMoney(1234.5, 'USDT', 'de-DE'), '1.234,50 USDT');
assert.equal(formatMoney(1234.5, 'COINS'), '1,234.50 COINS');
assert.equal(formatMoney(1234.5, ''), '1,234.50');
console.warn = quietWarn;
assert.equal(formatMoney(-0.001, 'GBP'), '£0.00', 'no "-£0.00"');

// round engine: phases only move when advance() is called (no device-clock timers), in the declared order
type P = 'bet' | 'locked' | 'reveal';
const seen: string[] = [];
const engine = new RoundEngine<P>(
  { bet: { next: 'locked' }, locked: { next: 'reveal' }, reveal: { next: 'bet' } },
  'bet',
);
const off = engine.on((c: PhaseChange<P>) => seen.push(`${c.from}>${c.to}`));
engine.start();
await new Promise((r) => setTimeout(r, 50));
assert.deepEqual(seen, ['null>bet'], 'no phase moves on its own');
engine.advance();
engine.advance();
assert.deepEqual(seen, ['null>bet', 'bet>locked', 'locked>reveal'], 'advance follows next');
engine.advance();
assert.equal(engine.phase, 'bet', 'the last phase wraps to its next');
engine.stop();
assert.equal(engine.phase, null);
engine.advance();
assert.equal(engine.phase, null, 'advance is ignored when stopped');
off();
engine.start();
assert.equal(seen.length, 4, 'unsubscribed listener is not called');
engine.stop();

console.log('services.check: ok');
