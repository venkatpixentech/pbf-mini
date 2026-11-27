/* eslint-disable react-refresh/only-export-components -- a page entry, not a hot-reloaded module */
// The Spine harness page: React owns the page and the buttons; each stage is a PixiStage with a Spine scene. The test
// (tests/e2e/spine.spec.ts) clicks the buttons and reads `window.__probe`. Not part of any game and never shipped.
import { Assets, Container, type TextureSource, Ticker } from 'pixi.js';
import { useState } from 'react';
import { createRoot } from 'react-dom/client';

import { PixiStage, type StageError } from 'core/pixi/PixiStage';
import { spineAssets as registry } from 'core/pixi/wrapper/SpineAssetBackend';

import { assetsOf, STAGE_SIZE, type ViewName } from './pixi/config/spineProbe.config';
import { type ProbeController, type ProbeEvent, type ProbeProps, SpineProbeScene } from './pixi/view/SpineProbeScene';

type Kind = ViewName | 'plain';
const STAGES: Array<{ id: string; kind: Kind }> = [
  { id: 'A', kind: 'gold' },
  { id: 'B', kind: 'gold' },
  { id: 'C', kind: 'goldBin' },
  { id: 'F', kind: 'fx' },
  { id: 'P', kind: 'plain' },
];

const probe = {
  stages: {} as Record<string, ProbeController>,
  errors: [] as string[],
  stats: () => registry.stats(),
  hasAlias: (alias: string) => Assets.cache.has(alias),
  sharedTickerCount: () => Ticker.shared.count,
  pages: [] as TextureSource[],
  /** Remembers the atlas page textures of an asset so a test can check they are destroyed after the last release. */
  capturePages(alias: string) {
    const atlas = Assets.cache.get(alias) as { pages: Array<{ texture: { texture: { source: TextureSource } } }> };
    probe.pages = atlas.pages.map((p) => p.texture.texture.source);
    return probe.pages.length;
  },
  pagesDestroyed: () => probe.pages.map((s) => s.destroyed),
  /** Something to put in a slot (PixSpine.attach). */
  newContainer: () => new Container(),
  /** The animation state of an instance, kept so a test can inspect it after the instance is destroyed. */
  kept: undefined as unknown as { listeners: unknown[] } | undefined,
};
declare global {
  interface Window {
    __probe: typeof probe;
  }
}
window.__probe = probe;

const createScene = () => new SpineProbeScene();

function Stage({ id, kind, paused }: { id: string; kind: Kind; paused: boolean }) {
  const props: ProbeProps = { view: kind === 'plain' ? null : kind };
  return (
    <PixiStage<ProbeProps, ProbeEvent>
      scene={createScene}
      props={props}
      spine={kind === 'plain' ? undefined : assetsOf(kind)}
      paused={paused}
      onEvent={(e) => {
        probe.stages[id] = e.controller;
      }}
      onError={(e: StageError) => probe.errors.push(`${id}: ${e.kind} ${String(e.error)}`)}
    />
  );
}

function App() {
  const [mounted, setMounted] = useState<Record<string, boolean>>({});
  const [paused, setPaused] = useState<Record<string, boolean>>({});
  const set = (setter: typeof setMounted, id: string, value: boolean) => setter((m) => ({ ...m, [id]: value }));
  return (
    <main>
      {STAGES.map(({ id, kind }) => (
        <section key={id} data-stage={id} style={{ display: 'inline-block', margin: 8 }}>
          <div>
            <button data-testid={`mount-${id}`} onClick={() => set(setMounted, id, true)}>
              mount {id} ({kind})
            </button>
            <button
              data-testid={`unmount-${id}`}
              onClick={() => {
                delete probe.stages[id];
                set(setMounted, id, false);
              }}
            >
              unmount {id}
            </button>
            <button data-testid={`pause-${id}`} onClick={() => set(setPaused, id, true)}>
              pause
            </button>
            <button data-testid={`resume-${id}`} onClick={() => set(setPaused, id, false)}>
              resume
            </button>
          </div>
          <div style={{ width: STAGE_SIZE, height: STAGE_SIZE, background: '#111' }}>
            {mounted[id] && <Stage id={id} kind={kind} paused={!!paused[id]} />}
          </div>
        </section>
      ))}
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
