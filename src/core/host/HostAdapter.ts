// The boundary where an operator's own message format would plug in. An adapter turns the bridge's typed messages into whatever a
// host page expects and back; the bridge keeps validating, origin-checking and binding either way, so an adapter can never widen
// what is accepted. No operator adapter (Games Global, GameFlex, Aristocrat) is implemented: each needs its own message audit and
// tests (docs/09-BACKEND-INTEGRATION.md, open question Q10), and the game's own backend calls never go through here.
import type { Envelope, GameToHost } from './HostMessages';

export interface HostAdapter {
  readonly name: string;
  /** The messages to post for one game message (the validated envelope is given). Most hosts want exactly one. */
  encode(message: GameToHost, envelope: Envelope): unknown[];
  /** Turns a raw inbound value into the bridge's envelope shape, or returns it unchanged. */
  decode(raw: unknown): unknown;
}

/** The framework's own envelope: `{ protocol, messageName, data }` both ways. */
export const pbfAdapter: HostAdapter = {
  name: 'pbf',
  encode: (_message, envelope) => [envelope],
  decode: (raw) => raw,
};
