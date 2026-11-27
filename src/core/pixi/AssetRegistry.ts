// Who owns loaded assets, how they are shared and when they are released: the lifecycle verified for Spine in Phase 2,
// generalised so plain assets (images, atlases, fonts, bitmap fonts) use the same one. Pure bookkeeping: the Pixi work sits
// behind an `AssetBackend`, so these rules are checked in Node (SpineAssets.check.ts, AssetRegistry.check.ts).
//
// - Ref-counted per key: two scenes or stages that acquire the same asset share one load and one set of textures.
// - Acquire takes its reference synchronously, so a release is always valid, even while loading or after a failed load.
// - Per asset, load and unload run one after another in the order they were asked for. A release while a load is
//   in flight waits for the load to settle before unloading, so nothing half-loaded is unloaded.
// - Unload runs only when the last reference is gone and no newer acquire is waiting. An acquire that arrives while
//   an unload is pending loads again after the unload finishes.

export type AssetBackend<Def> = {
  /** Prepares what loading needs (for Spine: the lazy runtime). Called before every load. May be called often. */
  ensureRuntime?(): Promise<void>;
  /** Registers and loads the asset. */
  load(def: Def): Promise<void>;
  /** Releases the asset. Must tolerate a half-registered one (a failed load is cleaned up through this too). */
  unload(def: Def): Promise<void>;
};

export type AssetLease = {
  keys: string[];
  /** Resolves when every asset of the lease is loaded; rejects when one fails to load. */
  ready: Promise<void>;
  /** Gives the references back. Safe to call more than once and at any time. */
  release(): void;
};

export type AssetRegistry<Def> = {
  acquire(defs: Def[]): AssetLease;
  /** Reference counts and load state per key, for tests and harnesses. */
  stats(): Record<string, { refs: number; loaded: boolean }>;
};

export type RegistryOptions<Def> = {
  keyOf(def: Def): string;
  /** True when two definitions of one key name the same files. A key may not change files while in use. */
  same(a: Def, b: Def): boolean;
  /** Names the kind of asset in error messages, for example 'Spine asset'. */
  label: string;
  onUnloadError?(key: string, error: unknown): void;
};

type Entry<Def> = {
  def: Def;
  refs: number;
  loaded: boolean;
  /** A load was attempted since the last unload (so a failed or partial load is still cleaned up on release). */
  touched: boolean;
  /** Serialises this asset's loads and unloads. Never rejects. */
  chain: Promise<void>;
};

export function createAssetRegistry<Def>(
  backend: AssetBackend<Def>,
  options: RegistryOptions<Def>,
): AssetRegistry<Def> {
  const { keyOf, same, label } = options;
  const onUnloadError =
    options.onUnloadError ?? ((key: string, error: unknown) => console.warn(`[assets] unload ${key} failed`, error));
  const entries = new Map<string, Entry<Def>>();

  async function load(e: Entry<Def>) {
    if (e.refs === 0 || e.loaded) return; // released before its turn, or already loaded for an earlier acquire
    e.touched = true;
    await backend.ensureRuntime?.();
    await backend.load(e.def);
    e.loaded = true;
  }

  async function unloadIfIdle(e: Entry<Def>) {
    if (e.refs > 0 || !e.touched) return; // a newer acquire is waiting, or nothing was ever loaded
    try {
      await backend.unload(e.def);
    } catch (error) {
      onUnloadError(keyOf(e.def), error);
    }
    e.loaded = false;
    e.touched = false;
  }

  return {
    acquire(defs) {
      const unique = new Map<string, Def>();
      for (const d of defs) {
        const seen = unique.get(keyOf(d));
        if (seen && !same(seen, d)) throw new Error(`${label} "${keyOf(d)}" is declared twice with different files`);
        unique.set(keyOf(d), d);
      }
      for (const [key, d] of unique) {
        const held = entries.get(key);
        if (held && (held.refs > 0 || held.touched) && !same(held.def, d))
          throw new Error(`${label} "${key}" is already in use with different files`);
      }
      const steps: Promise<void>[] = [];
      const held: Entry<Def>[] = [];
      for (const [key, d] of unique) {
        let e = entries.get(key);
        if (!e) entries.set(key, (e = { def: d, refs: 0, loaded: false, touched: false, chain: Promise.resolve() }));
        else e.def = d;
        e.refs++;
        held.push(e);
        const step = e.chain.then(() => load(e));
        e.chain = step.catch(() => {}); // a failed load must not stop later loads or unloads of this asset
        steps.push(step);
      }
      const ready = Promise.all(steps).then(() => undefined);
      ready.catch(() => {}); // callers that await `ready` still see the failure; an ignored lease does not warn
      let released = false;
      return {
        keys: [...unique.keys()],
        ready,
        release() {
          if (released) return;
          released = true;
          for (const e of held) {
            e.refs--;
            e.chain = e.chain.then(() => unloadIfIdle(e)).catch(() => {});
          }
        },
      };
    },
    stats() {
      return Object.fromEntries([...entries].map(([key, e]) => [key, { refs: e.refs, loaded: e.loaded }]));
    },
  };
}
