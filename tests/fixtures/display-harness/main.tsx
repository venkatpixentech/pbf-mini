/* eslint-disable react-refresh/only-export-components -- a page entry, not a hot-reloaded module */
// The display harness page: React owns the page and the buttons; each stage is a PixiStage with a display scene. The test
// (tests/e2e/display.spec.ts) clicks the buttons and reads `window.__display`. `?full=1` makes stage A fill the viewport (sizing
// tests). Not part of any game and never shipped.
import { Assets, Cache, CanvasTextMetrics, Texture } from 'pixi.js';
import { useState } from 'react';
import { createRoot } from 'react-dom/client';

import { AssetLoader, assetRegistry } from 'core/pixi/AssetLoader';
import type { SceneInteraction } from 'core/pixi/InteractionStep';
import type { AssetLease } from 'core/pixi/AssetRegistry';
import { DeviceProxy } from 'core/pixi/DeviceConfigProxy';
import { PixiStage, type StageError } from 'core/pixi/PixiStage';
import { UIUtil } from 'core/pixi/UIUtilService';
import { PixAnimatedSprite } from 'core/pixi/wrapper/PixAnimatedSprite';
import { remoteImageStats } from 'core/pixi/wrapper/PixDynamicSprite';

import { assetsOf, game, type Kind } from './pixi/config/game.config';
import {
  DisplayProbeScene,
  type ProbeController,
  type ProbeEvent,
  type ProbeProps,
} from './pixi/view/DisplayProbeScene';

AssetLoader.initAssets(game.bundles);

const STAGES: Array<{ id: string; kind: Kind }> = [
  { id: 'A', kind: 'cards' },
  { id: 'B', kind: 'cards' },
  { id: 'S', kind: 'seq' },
  { id: 'X', kind: 'bad' },
  { id: 'P', kind: 'plain' },
  { id: 'T', kind: 'tap' },
  { id: 'R', kind: 'strip' },
  { id: 'D', kind: 'remote' },
];
// ?full=1 makes stage A fill the viewport, ?full=T makes stage T (the interaction stage) fill it
const fullParam = new URLSearchParams(location.search).get('full');
const fullId = fullParam === null ? null : fullParam === '1' ? 'A' : fullParam;
const full = fullId !== null;

const leases = new Map<string, AssetLease>();
const probe = {
  stages: {} as Record<string, ProbeController>,
  errors: [] as string[],
  /** Every interaction event the scene reported, in order. */
  log: [] as SceneInteraction[],
  /** How many times React's action for a target ran: from a canvas tap or from the keyboard-accessible twin button. */
  selected: {} as Record<string, number>,
  stats: () => assetRegistry.stats(),
  /** Reference counts of remote images (PixDynamicSprite), by URL. */
  remoteStats: () => remoteImageStats(),
  hasAlias: (alias: string) => Assets.cache.has(alias),
  texture: (alias: string) => !!Assets.cache.has(alias) && !Texture.from(alias).destroyed,
  /** Takes a bundle outside any stage; resolves when loaded (or rejects with the failure). */
  async acquireBundles(name: string, ids: string[]) {
    const lease = AssetLoader.acquireBundles(ids);
    leases.set(name, lease);
    await lease.ready;
    return lease.keys;
  },
  release: (name: string) => leases.get(name)?.release(),
  bitmapInstalled: (name: string) => Cache.has(`${name}-bitmap`),
  lineCount: (t: { text: string; style: never }) => CanvasTextMetrics.measureText(t.text, t.style).lines.length,
  device: () => DeviceProxy.config,
  UIUtil,
  PixAnimatedSprite,
  Texture,
  Assets,
};
declare global {
  interface Window {
    __display: typeof probe;
  }
}
window.__display = probe;

const createScene = () => new DisplayProbeScene();

/** React's action for a target: the one handler both the canvas tap and the twin button call. */
const select = (target: string) => {
  probe.selected[target] = (probe.selected[target] ?? 0) + 1;
};
const TWINS = ['one', 'two', 'pad', 'edge', 'deep'];

function Stage({ id, kind, paused, disabled }: { id: string; kind: Kind; paused: boolean; disabled: string[] }) {
  const props: ProbeProps = { kind, disabled };
  return (
    <PixiStage<ProbeProps, ProbeEvent>
      scene={createScene}
      props={props}
      assets={assetsOf(kind)}
      paused={paused}
      onEvent={(e) => {
        if (e.type === 'ready') probe.stages[id] = e.controller;
        else {
          probe.log.push(e.event);
          if (e.event.type === 'tap') select(e.event.target); // the canvas tap runs the same action as the twin button
        }
      }}
      onError={(e: StageError) => probe.errors.push(`${id}: ${e.kind}`)}
    />
  );
}

function App() {
  const [mounted, setMounted] = useState<Record<string, boolean>>({});
  const [paused, setPaused] = useState<Record<string, boolean>>({});
  const [disabled, setDisabled] = useState<string[]>(['off']);
  const shown = full ? STAGES.filter((s) => s.id === fullId) : STAGES;
  return (
    <main>
      {shown.map(({ id, kind }) => (
        <section key={id} data-stage={id} style={{ display: full ? 'block' : 'inline-block', margin: full ? 0 : 8 }}>
          <div style={full ? { position: 'fixed', right: 0, bottom: 0, zIndex: 1 } : undefined}>
            <button data-testid={`mount-${id}`} onClick={() => setMounted((m) => ({ ...m, [id]: true }))}>
              mount {id} ({kind})
            </button>
            <button
              data-testid={`unmount-${id}`}
              onClick={() => {
                delete probe.stages[id];
                setMounted((m) => ({ ...m, [id]: false }));
              }}
            >
              unmount {id}
            </button>
            <button data-testid={`pause-${id}`} onClick={() => setPaused((p) => ({ ...p, [id]: true }))}>
              pause
            </button>
            <button data-testid={`resume-${id}`} onClick={() => setPaused((p) => ({ ...p, [id]: false }))}>
              resume
            </button>
            {kind === 'tap' && (
              <>
                <button data-testid="disable-one" onClick={() => setDisabled((d) => [...new Set([...d, 'one'])])}>
                  disable one
                </button>
                <button data-testid="enable-one" onClick={() => setDisabled((d) => d.filter((t) => t !== 'one'))}>
                  enable one
                </button>
                {/* the keyboard-accessible twins: real buttons that run the same action as a canvas tap */}
                {TWINS.map((t) => (
                  <button key={t} data-testid={`twin-${t}`} disabled={disabled.includes(t)} onClick={() => select(t)}>
                    select {t}
                  </button>
                ))}
              </>
            )}
          </div>
          <div
            className={full ? 'full' : undefined}
            style={full ? undefined : { width: 320, height: 420, background: '#111' }}
          >
            {mounted[id] && <Stage id={id} kind={kind} paused={!!paused[id]} disabled={disabled} />}
          </div>
        </section>
      ))}
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
