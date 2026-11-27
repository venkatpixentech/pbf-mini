// The host bridge contract: which messages a game and its host page exchange, and the rules a message must pass. Plain TypeScript
// with no browser objects, so `Host.check.ts` runs it in Node. The window wiring is in WrapperServiceProxy.ts.
//
// The legacy wrapper (corelib/models/WrapperServiceProxy.ts) posted about 55 kinds of message with target `*`, accepted any
// inbound message, and carried screen, betting and FTUE messages of one game. This keeps its envelope names (`messageName`, `data`)
// and the generic messages (canvas ready, balance, sound toggle, popup, snackbar, loading progress, client ready, app height,
// reload, banking, close, logout; and from the host: audio on or off, stop and resume, window reloaded), adds a protocol number,
// and tightens the rules: explicit allowed origins, a bound parent window, validated data, and never a token or secret.
// Messages are one-way in both directions: there are no request ids and no pending requests.

export const HOST_PROTOCOL = 1;

export type Envelope = { protocol: number; messageName: string; data?: unknown };

/** Game to host. */
export type GameToHost =
  | { messageName: 'CANVAS_READY'; data: { gameId: string } }
  | { messageName: 'CLIENT_READY' }
  | { messageName: 'UPDATE_BALANCE'; data: { balance: number } }
  | { messageName: 'TOGGLE_SOUND'; data: { soundOn: boolean } }
  | { messageName: 'SHOW_POPUP' | 'SHOW_SNACKBAR'; data: { message: string; kind?: string } }
  | { messageName: 'LOADING_PROGRESS'; data: { percent: number } }
  | { messageName: 'APP_HEIGHT'; data: { height: number } }
  | { messageName: 'RELOAD_APP' | 'LAUNCH_BANKING' | 'CLOSE_APP' | 'LOGOUT' };

/** Host to game. `HOST_INIT` binds the connection; the others are accepted only after it. */
export type HostToGame =
  | { messageName: 'HOST_INIT'; data: { currency?: string; language?: string; soundOn?: boolean } }
  | { messageName: 'IS_AUDIO_ON'; data: { soundOn: boolean } }
  | { messageName: 'STOP_CANVAS' | 'RESUME_CANVAS' | 'WINDOW_RELOADED' };

export type RejectReason =
  | 'disabled'
  | 'origin'
  | 'source'
  | 'malformed'
  | 'protocol'
  | 'unknown'
  | 'invalid-data'
  | 'secret'
  | 'not-connected'
  | 'bound-origin'
  | 'bound-source';

const MAX_TEXT = 512;
const SECRET_KEY = /token|secret|password|passwd|authorization|apikey|api_key|credential/i;

/** True when an object, at any depth, has a key that looks like a credential. Such data is never sent or accepted. */
export function hasSecretKey(value: unknown, depth = 0): boolean {
  if (depth > 6 || value === null || typeof value !== 'object') return false;
  return Object.entries(value as Record<string, unknown>).some(
    ([k, v]) => SECRET_KEY.test(k) || hasSecretKey(v, depth + 1),
  );
}

/**
 * An origin written exactly as a browser reports it (scheme, host, optional port, nothing else), http or https only. Returns it
 * normalised, or null: `*`, paths, other schemes and look-alikes are not origins.
 */
export function normalizeOrigin(value: string): string | null {
  if (typeof value !== 'string' || value === '*') return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    if (url.origin !== value && url.origin + '/' !== value) return null;
    return url.origin;
  } catch {
    return null;
  }
}

export type HostBridgeConfig = { allowedOrigins: string[]; gameId: string };

/** The allowed origins, normalised; throws for a wildcard or anything that is not an origin. An empty list is allowed: the bridge is inert. */
export function validateHostConfig(c: HostBridgeConfig, where = 'host'): string[] {
  if (!/^[a-z][a-z0-9]*$/.test(c.gameId ?? ''))
    throw new Error(`${where}: gameId must be lowercase letters and digits`);
  return c.allowedOrigins.map((o) => {
    const n = normalizeOrigin(o);
    if (!n)
      throw new Error(`${where}: "${o}" is not an allowed origin (use https://host[:port]; no wildcard, no path)`);
    return n;
  });
}

/**
 * Where the first message goes, never `*`: the configured host origin, else the parent origin the browser reports
 * (ancestor origins, then the referrer) when it is allowed, else, when several origins are allowed and none is known, one message per
 * allowed origin, each addressed to that origin only.
 */
export function helloTargets(input: {
  allowed: string[];
  hostOrigin?: string;
  ancestorOrigin?: string;
  referrerOrigin?: string;
}): string[] {
  const { allowed } = input;
  for (const candidate of [input.hostOrigin, input.ancestorOrigin, input.referrerOrigin]) {
    const n = candidate ? normalizeOrigin(candidate) : null;
    if (n && allowed.includes(n)) return [n];
  }
  return [...allowed];
}

const text = (v: unknown, max = MAX_TEXT) => typeof v === 'string' && v.length > 0 && v.length <= max;
const bool = (v: unknown) => typeof v === 'boolean';
const num = (v: unknown) => typeof v === 'number' && Number.isFinite(v);
const obj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Validates the data of an inbound message by its name. */
function inboundData(name: string, data: unknown): HostToGame | null {
  switch (name) {
    case 'HOST_INIT': {
      if (data !== undefined && !obj(data)) return null;
      const d = (data ?? {}) as Record<string, unknown>;
      if (d.currency !== undefined && !(typeof d.currency === 'string' && /^[A-Za-z]{3,5}$/.test(d.currency)))
        return null;
      if (
        d.language !== undefined &&
        !(typeof d.language === 'string' && /^[A-Za-z]{2,8}(-[A-Za-z0-9]{2,8})?$/.test(d.language))
      )
        return null;
      if (d.soundOn !== undefined && !bool(d.soundOn)) return null;
      return { messageName: 'HOST_INIT', data: d as { currency?: string; language?: string; soundOn?: boolean } };
    }
    case 'IS_AUDIO_ON':
      return obj(data) && bool(data.soundOn)
        ? { messageName: 'IS_AUDIO_ON', data: { soundOn: data.soundOn as boolean } }
        : null;
    case 'STOP_CANVAS':
    case 'RESUME_CANVAS':
    case 'WINDOW_RELOADED':
      return { messageName: name };
    default:
      return null;
  }
}

export type Parsed = { ok: true; message: HostToGame } | { ok: false; reason: RejectReason };

/** Validates a raw inbound value: an envelope of this protocol, a known name, valid data, and no credential-like key. */
export function parseInbound(raw: unknown): Parsed {
  if (!obj(raw)) return { ok: false, reason: 'malformed' };
  if (raw.protocol !== HOST_PROTOCOL) return { ok: false, reason: 'protocol' };
  if (!text(raw.messageName, 64)) return { ok: false, reason: 'malformed' };
  if (hasSecretKey(raw.data)) return { ok: false, reason: 'secret' };
  const known = ['HOST_INIT', 'IS_AUDIO_ON', 'STOP_CANVAS', 'RESUME_CANVAS', 'WINDOW_RELOADED'];
  if (!known.includes(raw.messageName as string)) return { ok: false, reason: 'unknown' };
  const message = inboundData(raw.messageName as string, raw.data);
  return message ? { ok: true, message } : { ok: false, reason: 'invalid-data' };
}

/** The envelope for an outbound message. Throws for a credential-like key or an invalid payload (a bug in the game, not in the host). */
export function buildOutbound(msg: GameToHost): Envelope {
  const data = 'data' in msg ? msg.data : undefined;
  if (hasSecretKey(data)) throw new Error(`host: ${msg.messageName} must not carry a token or secret`);
  const bad = (why: string) => new Error(`host: invalid ${msg.messageName}: ${why}`);
  if (msg.messageName === 'CANVAS_READY' && !text(msg.data.gameId, 64)) throw bad('gameId');
  if (msg.messageName === 'UPDATE_BALANCE' && !num(msg.data.balance)) throw bad('balance');
  if (msg.messageName === 'TOGGLE_SOUND' && !bool(msg.data.soundOn)) throw bad('soundOn');
  if ((msg.messageName === 'SHOW_POPUP' || msg.messageName === 'SHOW_SNACKBAR') && !text(msg.data.message))
    throw bad('message');
  if (
    msg.messageName === 'LOADING_PROGRESS' &&
    !(num(msg.data.percent) && msg.data.percent >= 0 && msg.data.percent <= 100)
  )
    throw bad('percent');
  if (msg.messageName === 'APP_HEIGHT' && !(num(msg.data.height) && msg.data.height >= 0)) throw bad('height');
  return data === undefined
    ? { protocol: HOST_PROTOCOL, messageName: msg.messageName }
    : { protocol: HOST_PROTOCOL, messageName: msg.messageName, data };
}

/** What the bridge knows when a message arrives. */
export type BridgeState = {
  enabled: boolean;
  allowed: string[];
  /** The only window a message may come from (the host window). */
  parent: unknown;
  /** Set by a valid HOST_INIT: later messages must match it. */
  binding: { origin: string; source: unknown } | null;
};

export type Decision =
  | { accept: true; message: HostToGame; bind?: { origin: string; source: unknown } }
  | { accept: false; reason: RejectReason };

/**
 * Whether to accept an inbound message event: the bridge is on, the origin is allowed, the source is the host window, the
 * envelope is valid; before HOST_INIT only HOST_INIT passes (and it binds the origin and window); after it, only that origin and
 * that window do.
 */
export function decide(event: { origin: string; source: unknown; data: unknown }, state: BridgeState): Decision {
  if (!state.enabled) return { accept: false, reason: 'disabled' };
  if (!state.allowed.includes(event.origin)) return { accept: false, reason: 'origin' };
  if (event.source !== state.parent) return { accept: false, reason: 'source' };
  if (state.binding) {
    if (event.origin !== state.binding.origin) return { accept: false, reason: 'bound-origin' };
    if (event.source !== state.binding.source) return { accept: false, reason: 'bound-source' };
  }
  const parsed = parseInbound(event.data);
  if (!parsed.ok) return { accept: false, reason: parsed.reason };
  if (!state.binding) {
    if (parsed.message.messageName !== 'HOST_INIT') return { accept: false, reason: 'not-connected' };
    return { accept: true, message: parsed.message, bind: { origin: event.origin, source: event.source } };
  }
  return { accept: true, message: parsed.message };
}
