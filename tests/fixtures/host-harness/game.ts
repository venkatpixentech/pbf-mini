// The game side of the host harness: a plain page that loads the bridge lazily and reports what it received, rejected and posted.
// Query: allowed=<origins, comma separated>, gameId, hostOrigin, discover=0, adapter=wrapped, connect=0 (do not connect).
import type { HostAdapter } from 'core/host/HostAdapter';
import type { RejectReason } from 'core/host/HostMessages';
import type { WrapperServiceProxy } from 'core/host/WrapperServiceProxy';

const q = new URLSearchParams(location.search);

type Probe = {
  bridge: WrapperServiceProxy | null;
  received: Array<{ name: string; data: unknown }>;
  rejected: Array<{ reason: RejectReason; origin: string }>;
  posted: Array<{ message: unknown; targetOrigin: string }>;
  connect(): Promise<void>;
  disconnect(): void;
  handlerCalls: number;
};
declare global {
  interface Window {
    __game: Probe;
  }
}

/** A made-up operator format, to prove an adapter changes only the shape of messages: { op, payload, v: 1 }. */
const wrapped: HostAdapter = {
  name: 'wrapped',
  encode: (_m, envelope) => [{ op: envelope.messageName, payload: envelope.data, v: 1 }],
  decode: (raw) => {
    const r = raw as { op?: string; payload?: unknown; v?: number } | null;
    return r && typeof r === 'object' && typeof r.op === 'string'
      ? { protocol: r.v, messageName: r.op, data: r.payload }
      : raw;
  },
};

const probe: Probe = {
  bridge: null,
  received: [],
  rejected: [],
  posted: [],
  handlerCalls: 0,
  async connect() {
    const { createWrapperProxy } = await import('core/host/WrapperServiceProxy');
    const record = (name: string) => (data: unknown) => {
      probe.handlerCalls++;
      probe.received.push({ name, data });
      document.getElementById('status')!.textContent =
        `${probe.bridge?.connected ? 'connected' : 'not connected'}: ${name}`;
    };
    probe.bridge = createWrapperProxy({
      allowedOrigins: (q.get('allowed') ?? '').split(',').filter(Boolean),
      gameId: q.get('gameId') ?? 'hostprobe',
      hostOrigin: q.get('hostOrigin') ?? undefined,
      discoverHost: q.get('discover') !== '0',
      adapter: q.get('adapter') === 'wrapped' ? wrapped : undefined,
      onRejected: (reason, info) => probe.rejected.push({ reason, origin: info.origin }),
      onPosted: (message, targetOrigin) => probe.posted.push({ message, targetOrigin }),
    });
    probe.bridge.connect({
      HOST_INIT: record('HOST_INIT'),
      IS_AUDIO_ON: record('IS_AUDIO_ON'),
      STOP_CANVAS: record('STOP_CANVAS'),
      RESUME_CANVAS: record('RESUME_CANVAS'),
      WINDOW_RELOADED: record('WINDOW_RELOADED'),
    });
  },
  disconnect() {
    probe.bridge?.dispose();
  },
};
window.__game = probe;
if (q.get('connect') !== '0') void probe.connect();
