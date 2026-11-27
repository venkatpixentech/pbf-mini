// Self-check: node --experimental-strip-types --no-warnings src/core/host/Host.check.ts
// The host bridge rules: origins, the first message's addresses, envelope validation, secrets, and the accept or reject decision.
import assert from 'node:assert/strict';

import {
  type BridgeState,
  buildOutbound,
  decide,
  hasSecretKey,
  helloTargets,
  HOST_PROTOCOL,
  normalizeOrigin,
  parseInbound,
  validateHostConfig,
} from './HostMessages.ts';

// origins: exactly an origin, http or https, never a wildcard or a path
assert.equal(normalizeOrigin('https://host.example'), 'https://host.example');
assert.equal(normalizeOrigin('https://host.example/'), 'https://host.example');
assert.equal(normalizeOrigin('http://localhost:4173'), 'http://localhost:4173');
for (const bad of [
  '*',
  'https://host.example/path',
  'ftp://x',
  'host.example',
  '',
  'https://a.example?x=1',
  'javascript:alert(1)',
])
  assert.equal(normalizeOrigin(bad), null, bad);
assert.deepEqual(
  validateHostConfig({ allowedOrigins: ['https://a.example/', 'http://localhost:1'], gameId: 'probegame' }),
  ['https://a.example', 'http://localhost:1'],
);
assert.deepEqual(
  validateHostConfig({ allowedOrigins: [], gameId: 'probegame' }),
  [],
  'an empty list is allowed: the bridge is inert',
);
assert.throws(() => validateHostConfig({ allowedOrigins: ['*'], gameId: 'probegame' }), /not an allowed origin/);
assert.throws(
  () => validateHostConfig({ allowedOrigins: ['https://a.example/x'], gameId: 'probegame' }),
  /not an allowed origin/,
);
assert.throws(() => validateHostConfig({ allowedOrigins: [], gameId: 'Bad Id' }), /gameId/);

// the first message's addresses are never "*": a known allowed host, else one message per allowed origin
const allowed = ['https://a.example', 'https://b.example'];
assert.deepEqual(helloTargets({ allowed, hostOrigin: 'https://b.example' }), ['https://b.example']);
assert.deepEqual(helloTargets({ allowed, ancestorOrigin: 'https://a.example' }), ['https://a.example']);
assert.deepEqual(helloTargets({ allowed, referrerOrigin: 'https://b.example' }), ['https://b.example']);
assert.deepEqual(
  helloTargets({ allowed, hostOrigin: 'https://evil.example' }),
  allowed,
  'a host origin that is not allowed is ignored',
);
assert.deepEqual(helloTargets({ allowed }), allowed, 'unknown: each allowed origin is addressed on its own');
assert.deepEqual(helloTargets({ allowed: [] }), []);
assert.ok(!helloTargets({ allowed }).includes('*'));

// secrets: a credential-like key is never sent or accepted, at any depth
assert.equal(hasSecretKey({ a: 1 }), false);
assert.equal(hasSecretKey({ beToken: 'x' }), true);
assert.equal(hasSecretKey({ nested: { deeper: [{ x: 1 }], Authorization: 'x' } }), true);
assert.equal(hasSecretKey({ nested: { password: 1 } }), true);
assert.equal(hasSecretKey('token'), false);

// inbound envelopes
const env = (messageName: string, data?: unknown, protocol = HOST_PROTOCOL) => ({ protocol, messageName, data });
const ok = (raw: unknown) => parseInbound(raw);
assert.deepEqual(ok(env('HOST_INIT', { currency: 'GBP', language: 'en-GB', soundOn: true })), {
  ok: true,
  message: { messageName: 'HOST_INIT', data: { currency: 'GBP', language: 'en-GB', soundOn: true } },
});
assert.equal(ok(env('HOST_INIT')).ok, true, 'init data is optional');
assert.equal(ok(env('IS_AUDIO_ON', { soundOn: false })).ok, true);
assert.equal(ok(env('STOP_CANVAS')).ok, true);
const reason = (raw: unknown) => {
  const r = parseInbound(raw);
  return r.ok ? 'accepted' : r.reason;
};
assert.equal(reason(null), 'malformed');
assert.equal(reason('text'), 'malformed');
assert.equal(reason([]), 'malformed');
assert.equal(reason(env('HOST_INIT', {}, 2)), 'protocol');
assert.equal(reason({ messageName: 'HOST_INIT' }), 'protocol');
assert.equal(reason(env('', {})), 'malformed');
assert.equal(reason(env('SHOW_PLACED_BET', {})), 'unknown');
assert.equal(reason(env('HOST_INIT', { currency: 'pound sterling' })), 'invalid-data');
assert.equal(reason(env('HOST_INIT', { soundOn: 'yes' })), 'invalid-data');
assert.equal(reason(env('IS_AUDIO_ON', {})), 'invalid-data');
assert.equal(reason(env('HOST_INIT', { beToken: 'abc' })), 'secret');
assert.equal(reason(env('IS_AUDIO_ON', { soundOn: true, nested: { password: 1 } })), 'secret');

// outbound envelopes
assert.deepEqual(buildOutbound({ messageName: 'CANVAS_READY', data: { gameId: 'probegame' } }), {
  protocol: 1,
  messageName: 'CANVAS_READY',
  data: { gameId: 'probegame' },
});
assert.deepEqual(buildOutbound({ messageName: 'RELOAD_APP' }), { protocol: 1, messageName: 'RELOAD_APP' });
assert.throws(() => buildOutbound({ messageName: 'UPDATE_BALANCE', data: { balance: NaN } }), /balance/);
assert.throws(() => buildOutbound({ messageName: 'SHOW_POPUP', data: { message: '' } }), /message/);
assert.throws(() => buildOutbound({ messageName: 'LOADING_PROGRESS', data: { percent: 120 } }), /percent/);
assert.throws(
  () => buildOutbound({ messageName: 'SHOW_POPUP', data: { message: 'x', beToken: 'y' } as never }),
  /token or secret/,
);

// the decision: bridge on, origin allowed, source is the host window, envelope valid; HOST_INIT binds; then only the bound one passes
const parent = { name: 'parent' };
const other = { name: 'sibling' };
const state = (binding: BridgeState['binding'] = null, enabled = true): BridgeState => ({
  enabled,
  allowed: ['https://a.example', 'https://b.example'],
  parent,
  binding,
});
const init = env('HOST_INIT', { currency: 'GBP' });
const rejected = (d: ReturnType<typeof decide>) => (d.accept ? 'accepted' : d.reason);
assert.equal(
  rejected(decide({ origin: 'https://a.example', source: parent, data: init }, state(null, false))),
  'disabled',
);
assert.equal(rejected(decide({ origin: 'https://evil.example', source: parent, data: init }, state())), 'origin');
assert.equal(
  rejected(decide({ origin: 'https://a.example', source: other, data: init }, state())),
  'source',
  'an allowed origin from another window',
);
assert.equal(
  rejected(
    decide({ origin: 'https://a.example', source: parent, data: env('IS_AUDIO_ON', { soundOn: true }) }, state()),
  ),
  'not-connected',
);
assert.equal(rejected(decide({ origin: 'https://a.example', source: parent, data: 'junk' }, state())), 'malformed');
const first = decide({ origin: 'https://a.example', source: parent, data: init }, state());
assert.ok(
  first.accept && first.bind?.origin === 'https://a.example' && first.bind.source === parent,
  'HOST_INIT binds origin and window',
);
const bound = { origin: 'https://a.example', source: parent };
const later = decide(
  { origin: 'https://a.example', source: parent, data: env('IS_AUDIO_ON', { soundOn: false }) },
  state(bound),
);
assert.ok(later.accept && later.message.messageName === 'IS_AUDIO_ON' && !later.bind);
assert.equal(
  rejected(decide({ origin: 'https://b.example', source: parent, data: env('STOP_CANVAS') }, state(bound))),
  'bound-origin',
  'another allowed origin after binding',
);
assert.equal(
  rejected(decide({ origin: 'https://a.example', source: other, data: env('STOP_CANVAS') }, state(bound))),
  'source',
);
assert.equal(
  rejected(
    decide({ origin: 'https://a.example', source: parent, data: env('STOP_CANVAS', undefined, 9) }, state(bound)),
  ),
  'protocol',
);

console.log('Host.check: ok');
