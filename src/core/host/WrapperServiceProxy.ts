// WrapperServiceProxy: adapted from the legacy framework's corelib/models/WrapperServiceProxy.ts (kept in legacy/corelib). The same
// bridge between a game and the page that hosts it: `connect` is the legacy readURLParams (it installs the `message` listener and
// starts the handshake), `postDataToWrapper` posts to the host, and the send* methods and the host's messages keep the legacy names
// for the generic parts (CANVAS_READY, UPDATE_BALANCE, TOGGLE_SOUND, SHOW_POPUP, SHOW_SNACKBAR, progress, client ready, app height,
// reload, banking, close, logout; IS_AUDIO_ON, STOP_CANVAS, RESUME_CANVAS, WINDOW_RELOADED). What changed, and why:
//  - Not carried: everything specific to Ultimate Soccer (its screens, FTUE, betting and team messages), the Games Global, GameFlex and
//    Aristocrat message formats (HostAdapter.ts is their boundary; none is implemented), the global window.gameExtension and
//    window.unmountScreen entry points, and the hard-coded fallback operator token (never carried: the legacy copy has it redacted).
//  - Rules the legacy code did not have (docs/09-BACKEND-INTEGRATION.md findings S2 and S3): the allowed origins are explicit
//    (an empty list makes the bridge inert); a message is accepted only from an allowed origin AND the host window; the first valid
//    HOST_INIT binds that origin and window and only they are heard afterwards; data is validated and a credential-like key is refused
//    both ways; and nothing is ever posted to `*`.
//  - Lazy: a screen loads this module with import() when it is embedded. A game that is not in a host page (window.parent is itself)
//    gets an inert bridge. `dispose()` removes the listener and ends all sending.
import { warnOnce } from 'core/utils/LoggerService';

import { type HostAdapter, pbfAdapter } from './HostAdapter';
import {
  buildOutbound,
  decide,
  type GameToHost,
  helloTargets,
  type HostToGame,
  normalizeOrigin,
  type RejectReason,
  validateHostConfig,
} from './HostMessages';

type DataOf<K extends HostToGame['messageName']> =
  Extract<HostToGame, { messageName: K }> extends { data: infer D } ? D : undefined;
export type HostHandlers = { [K in HostToGame['messageName']]?: (data: DataOf<K>) => void };

export type WrapperOptions = {
  /** Origins a host may use, written as `https://host[:port]`. Empty means the bridge is inert. */
  allowedOrigins: string[];
  gameId: string;
  /** The host's origin when the game knows it; otherwise it is read from the browser, else every allowed origin is greeted. */
  hostOrigin?: string;
  adapter?: HostAdapter;
  /** For tests: the host window (default: window.parent when the game is framed). */
  parent?: Window | null;
  self?: Window;
  /** Read the host origin from the browser (ancestor origins, referrer) when `hostOrigin` is not given. Default true. */
  discoverHost?: boolean;
  /** Told about every message the bridge posts, with the origin it was addressed to (diagnostics and tests). */
  onPosted?: (message: unknown, targetOrigin: string) => void;
  /** Told about every message that was not accepted, with the reason (diagnostics; the message is never delivered). */
  onRejected?: (reason: RejectReason, info: { origin: string }) => void;
};

export class WrapperServiceProxy {
  private readonly allowed: string[];
  private readonly self: Window;
  private readonly parent: Window | null;
  private readonly adapter: HostAdapter;
  private handlers: HostHandlers = {};
  private binding: { origin: string; source: unknown } | null = null;
  private listener: ((e: MessageEvent) => void) | undefined;
  private targets: string[] = [];
  private disposed = false;
  private readonly subscribers = new Set<() => void>();

  constructor(private readonly options: WrapperOptions) {
    this.allowed = validateHostConfig(options);
    this.self = options.self ?? window;
    this.adapter = options.adapter ?? pbfAdapter;
    this.parent =
      options.parent === undefined ? (this.self.parent !== this.self ? this.self.parent : null) : options.parent;
  }

  /** True when a host page exists and at least one origin is allowed. */
  get enabled(): boolean {
    return !this.disposed && this.parent !== null && this.allowed.length > 0;
  }

  /** True after a valid HOST_INIT from the host window. */
  get connected(): boolean {
    return this.binding !== null && !this.disposed;
  }

  get hostOrigin(): string | undefined {
    return this.binding?.origin;
  }

  /** The origins the first message was addressed to (never `*`). */
  get helloOrigins(): string[] {
    return [...this.targets];
  }

  subscribe = (listener: () => void): (() => void) => {
    this.subscribers.add(listener);
    return () => void this.subscribers.delete(listener);
  };

  getSnapshot = (): boolean => this.connected;

  private changed() {
    for (const s of [...this.subscribers]) s();
  }

  /**
   * Starts listening and greets the host (the legacy readURLParams and sendCanvasReady). Returns the function that ends it.
   * Not framed or no allowed origin: nothing is installed or sent.
   */
  connect(handlers: HostHandlers = {}): () => void {
    this.handlers = handlers;
    if (this.disposed) return () => undefined;
    if (!this.allowed.length) warnOnce('host', 'no allowed origins: the host bridge is off');
    if (!this.enabled || this.listener) return () => this.dispose();
    this.listener = (event) => this.onMessage(event);
    this.self.addEventListener('message', this.listener);
    const ancestor = (this.self.location as Location & { ancestorOrigins?: DOMStringList }).ancestorOrigins?.[0];
    let referrerOrigin: string | undefined;
    try {
      referrerOrigin = this.self.document.referrer ? new URL(this.self.document.referrer).origin : undefined;
    } catch {
      referrerOrigin = undefined;
    }
    const discover = this.options.discoverHost !== false;
    this.targets = helloTargets({
      allowed: this.allowed,
      hostOrigin: this.options.hostOrigin,
      ancestorOrigin: discover ? ancestor : undefined,
      referrerOrigin: discover ? referrerOrigin : undefined,
    });
    this.sendCanvasReady();
    return () => this.dispose();
  }

  private onMessage(event: MessageEvent) {
    if (this.disposed) return;
    const decision = decide(
      { origin: event.origin, source: event.source, data: this.adapter.decode(event.data) },
      { enabled: this.enabled, allowed: this.allowed, parent: this.parent, binding: this.binding },
    );
    if (!decision.accept) {
      warnOnce('host', `a message was rejected (${decision.reason})`);
      this.options.onRejected?.(decision.reason, { origin: event.origin });
      return;
    }
    if (decision.bind) {
      this.binding = decision.bind;
      this.changed();
    }
    const m = decision.message;
    const handler = this.handlers[m.messageName] as ((data: unknown) => void) | undefined;
    handler?.('data' in m ? m.data : undefined);
  }

  /**
   * Posts a message to the host. Before the handshake only CANVAS_READY goes out (to the greeted origins); afterwards every message
   * goes to the bound host origin and window. Returns whether it was posted.
   */
  public postDataToWrapper(msg: GameToHost): boolean {
    if (!this.enabled || !this.parent) return false;
    const envelope = buildOutbound(msg);
    const encoded = this.adapter.encode(msg, envelope);
    if (this.binding) {
      for (const m of encoded) this.post(m, this.binding.origin);
      return true;
    }
    if (msg.messageName !== 'CANVAS_READY') return false; // not connected: nothing but the greeting is sent
    for (const origin of this.targets) for (const m of encoded) this.post(m, origin);
    return this.targets.length > 0;
  }

  private post(message: unknown, targetOrigin: string) {
    this.parent!.postMessage(message, targetOrigin);
    this.options.onPosted?.(message, targetOrigin);
  }

  sendCanvasReady(): boolean {
    return this.postDataToWrapper({ messageName: 'CANVAS_READY', data: { gameId: this.options.gameId } });
  }
  sendClientReady(): boolean {
    return this.postDataToWrapper({ messageName: 'CLIENT_READY' });
  }
  updateBalanceToWrapper(balance: number): boolean {
    return this.postDataToWrapper({ messageName: 'UPDATE_BALANCE', data: { balance } });
  }
  sendSoundToggleTowrapper(soundOn: boolean): boolean {
    return this.postDataToWrapper({ messageName: 'TOGGLE_SOUND', data: { soundOn } });
  }
  sendShowPopup(data: { message: string; kind?: string }): boolean {
    return this.postDataToWrapper({ messageName: 'SHOW_POPUP', data });
  }
  sendShowSnackbar(data: { message: string; kind?: string }): boolean {
    return this.postDataToWrapper({ messageName: 'SHOW_SNACKBAR', data });
  }
  sendProgressUpdate(percent: number): boolean {
    return this.postDataToWrapper({ messageName: 'LOADING_PROGRESS', data: { percent } });
  }
  notifyAppHeight(height: number): boolean {
    return this.postDataToWrapper({ messageName: 'APP_HEIGHT', data: { height } });
  }
  sendReloadGame(): boolean {
    return this.postDataToWrapper({ messageName: 'RELOAD_APP' });
  }
  sendLaunchBanking(): boolean {
    return this.postDataToWrapper({ messageName: 'LAUNCH_BANKING' });
  }
  sendCloseApp(): boolean {
    return this.postDataToWrapper({ messageName: 'CLOSE_APP' });
  }
  sendLogout(): boolean {
    return this.postDataToWrapper({ messageName: 'LOGOUT' });
  }

  /** Removes the listener and ends all sending and handling. Safe to call more than once. */
  dispose(): void {
    if (this.disposed) return;
    if (this.listener) this.self.removeEventListener('message', this.listener);
    this.listener = undefined;
    this.disposed = true;
    this.binding = null;
    this.handlers = {};
    this.changed();
    this.subscribers.clear();
  }
}

export const createWrapperProxy = (options: WrapperOptions) => new WrapperServiceProxy(options);
export { normalizeOrigin };
