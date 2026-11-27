// React access to the host bridge: one bridge per mounted screen, connected on mount and disposed on unmount (safe under React
// StrictMode), with `connected` as live state. The screen supplies the allowed origins from its own config and handles host
// messages (a balance, a sound toggle) with plain React state.
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';

import {
  type HostHandlers,
  createWrapperProxy,
  type WrapperOptions,
  type WrapperServiceProxy,
} from './WrapperServiceProxy';

export function useHostBridge(
  options: WrapperOptions,
  handlers: HostHandlers = {},
): { bridge: WrapperServiceProxy | null; connected: boolean } {
  const [bridge, setBridge] = useState<WrapperServiceProxy | null>(null);
  const latest = useRef(handlers);
  useEffect(() => {
    latest.current = handlers;
  });
  const { gameId, hostOrigin } = options;
  const origins = options.allowedOrigins.join(',');
  useEffect(() => {
    const created = createWrapperProxy({
      ...options,
      allowedOrigins: origins ? origins.split(',') : [],
      gameId,
      hostOrigin,
    });
    // handlers are read at call time through a Proxy, so a re-render does not reconnect
    created.connect(
      new Proxy({} as HostHandlers, {
        get: (_t, name: string) => (latest.current as Record<string, unknown>)[name],
      }),
    );
    // the bridge is created with this effect so it is disposed with it (and recreated under StrictMode)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setBridge(created);
    return () => {
      created.dispose();
      setBridge(null);
    };
    // the options object is rebuilt on every render; its identifying parts are the dependencies
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [origins, gameId, hostOrigin]);
  const connected = useSyncExternalStore(
    (cb) => (bridge ? bridge.subscribe(cb) : () => undefined),
    () => bridge?.getSnapshot() ?? false,
  );
  return { bridge, connected };
}
