// Small shared logger: one prefix format and one warn-once for every part of the core. Plain TypeScript (no React,
// no Pixi), so it can be used anywhere and checked in Node. `debug` is silent in production builds.
const isDev = (): boolean => (import.meta as { env?: { DEV?: boolean } }).env?.DEV === true;

const format = (scope: string, message: string) => `[${scope}] ${message}`;

export const Logger = {
  debug: (scope: string, message: string, ...rest: unknown[]) => {
    if (isDev()) console.debug(format(scope, message), ...rest);
  },
  warn: (scope: string, message: string, ...rest: unknown[]) => console.warn(format(scope, message), ...rest),
  error: (scope: string, message: string, ...rest: unknown[]) => console.error(format(scope, message), ...rest),
};

const warned = new Set<string>();

/** Warns once per distinct scope and message, for problems that would otherwise repeat every frame. */
export function warnOnce(scope: string, message: string): void {
  const key = format(scope, message);
  if (warned.has(key)) return;
  warned.add(key);
  console.warn(key);
}
