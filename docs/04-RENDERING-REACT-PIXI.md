# 04. Rendering: React and PixiJS

React owns the application: screens, layout, controls, state and backend calls. PixiJS (8.9.2) renders only
canvas gameplay and heavy effects. This doc covers how the two connect and the rules for canvas code.

## When to use what

| Need | Use |
|---|---|
| Buttons, panels, text, counters, stamps, transitions | React + CSS (no animation library is installed) |
| A small one-off canvas effect (confetti, glow) | `usePixiEffect` (`src/core/pixi/usePixiEffect.tsx`) with a config file for its numbers |
| A gameplay surface with state or events (card flip, crash curve) | a typed `PixiScene` class inside `<PixiStage>` |

A game that needs no canvas sets `renderer: 'dom'` and never downloads Pixi (Last Man Standing). The boot
itself never imports Pixi (doc 05).

## The pieces

| File | Role |
|---|---|
| `core/pixi/PixiStage.tsx` | React component that owns one Pixi `Application` per mount and runs a scene in it |
| `core/pixi/scene.ts` | Scene contract: `PixiScene`, `SceneContext`, `SceneFactory`, `StageAsset` |
| `core/pixi/usePixiEffect.tsx` | Wraps a draw function in a scene for quick effects |
| `core/pixi/CanvasFrame.tsx` | The canvas box: height from a view config, or `fill` to fill a layout slot |
| `core/pixi/viewConfig.ts` | Typed config shapes (canvas portion, text/sprite/shape/group elements) and validators |
| `core/pixi/buildView.ts` | `buildElements(config, data)`: config element list to Pixi objects, with data binding |
| `core/pixi/theme.ts` | `COLORS`, `FONTS`, `TIER_COLORS` as Pixi values (names match the CSS tokens) |
| `core/pixi/stageAssets.ts`, `preload.ts`, `warmup.ts` | Ref-counted stage assets, boot preload, WebGL warm-up (docs 05, 07) |

## `<PixiStage>`

```tsx
<CanvasFrame config={cardRevealConfig.canvas} fill className="hol-stage">
  <PixiStage
    critical                       // the first screen's main canvas: the boot waits for its first frame
    scene={createScene}            // stable factory: () => new CardRevealScene()
    props={cards}                  // data in; the scene's update(props) runs when it changes
    assets={CARD_REVEAL_ASSETS}    // loaded on mount (ref counted), released on unmount
    onEvent={onSceneEvent}         // typed events out, e.g. REVEAL_DONE
    onError={onSceneError}         // init / assets / scene / context-lost
    transparent
  />
</CanvasFrame>
```

Lifecycle (one Application per mount, nothing shared between mounts):
- `Application.init` with `resizeTo` the host box, resolution `min(devicePixelRatio, 2)`, `autoDensity`,
  antialias; the canvas is appended only after assets are loaded.
- Resize: Pixi's `resizeTo` follows window resizes; a `ResizeObserver` on the host also calls
  `app.queueResize()` when the layout slot changes without a window resize. Same Application, no
  re-initialisation; the scene's `resize(width, height)` runs.
- Paused when the tab is hidden or when `paused` is set. Scenes must not assume time passes while hidden.
- WebGL context loss: the ticker stops and `onError({ kind: 'context-lost' })` fires. When the browser restores
  the context the stage redraws, resumes and calls `onRecovered`. If it is not restored within 3 s the stage
  rebuilds its Application and scene from the latest props.
- Props that change while the scene is still starting are applied with one `update()` right after `init`.
- Teardown runs exactly once on every path (normal unmount, unmount during async init under React
  StrictMode, init failure): scene `destroy`, tracked disposers, `app.destroy` with children, asset release.
- `critical`: after the scene is built the stage draws one frame synchronously and reports ready, which
  removes the loading overlay; a failed critical stage reports failure so the overlay never stays up.

## Scenes

```ts
export class CardRevealScene implements PixiScene<CardRevealProps, CardRevealEvent> {
  init(ctx, props) { /* build from config, ctx.root.addChild(...), ctx.track(() => ticker.remove(step)) */ }
  update(props) { /* react to new props */ }
  resize(width, height) { /* lay out for the new size */ }
  destroy() { /* stop anything not tracked */ }
}
```

Rules:
- Scenes never import React, stores or services. Data comes in through props; the only way out is
  `ctx.emit(event)`. Scenes never call the backend and do not play sounds (they emit events; the screen
  reacts).
- Register every ticker callback and listener with `ctx.track(dispose)`.
- Game state lives in React; the scene receives the slice it draws. No second copy of state in the scene.
- List textures in the game's `preload` (first screen) or the stage's `assets`.

## View + config

Every canvas has a config file (what to draw) and a view (how it moves):

- **Config** `scenes/<name>.config.ts`: canvas portion (`canvas: { heightPct, minHeight, maxHeight }`, used
  when not in a layout slot), element list (positions, sizes, fonts and colours by theme name), timings,
  assets. This is the file to edit to change the canvas.
- **View** `scenes/<Name>Scene.ts`: `buildElements(config.elements, data)` builds the objects; each object is
  labelled with its config `id` (`getChildByLabel`). No literal sizes, colours, fonts or timings in the view.
- Element types: `text` (`text` or `bind`, optional `upper`), `sprite` (`alias`, may contain `{key}` tokens
  such as `{tier}Badge`), `shape` (`fill`, `fillBind` or `stroke`), `group` (children).
- `buildElements` validates a config once (unique ids, text has text or bind, sprites have an alias, shapes
  have a size); a missing texture or bind value warns once and draws nothing instead of throwing.
- Live drawings (the crash curve) stay in the view, but their padding, widths, colours and labels come
  from the config.
- Each Pixi game has a `scenes/config.check.ts` self-check that validates its configs in Node.

Reference implementations: `src/games/higherlower/scenes/` (card reveal: flip, staged reveal, OVR roll) and
`src/games/accacrash/scenes/` (crash curve with a pulsing head, labels from config).

Pixi views in the current games (3 views in 2 games; each has its own config):

| Game | View | What it does | File |
|---|---|---|---|
| Higher or Lower | Card reveal | Flips the cards and runs the staged reveal (`PixiScene` class, `critical`) | `src/games/higherlower/scenes/CardRevealScene.ts` |
| Higher or Lower | Win confetti | One burst when a round is won (`usePixiEffect` draw function) | `src/games/higherlower/WinConfetti.tsx` |
| Acca Crash | Crash curve | Draws the live curve with a pulsing head (`PixiScene` class) | `src/games/accacrash/scenes/CrashCurveScene.ts` |
| Last Man Standing | none | `renderer: 'dom'`, plain React and CSS | n/a |

## Verified behaviour

- Lifecycle spike: 50 mount/unmount cycles left 0 WebGL contexts alive (Pixi calls `WEBGL_lose_context` on
  destroy); 7 of 7 lifecycle checks passed in 6 s. Pixi's ResizePlugin removes its listener twice per
  destroy (harmless).
- After the scene-lifecycle fixes: reveal cancellation before and after the flip midpoint, unmount during an
  animation, 30 stage and 20 confetti mount/unmount cycles left no extra canvases; console clean.
- Resize: Higher or Lower and Acca Crash resized through four sizes in one page kept one canvas, the same
  element, with the drawing buffer following each size (doc 06).

Not verified: memory returning to baseline after many cycles, iOS Safari navigation loops, GPU texture
release, frame rate on low-end Android.

## Constraints

- No `@pixi/react`: it needs React 19; the project stays on React 18.3.1.
- Pixi v7 `settings.*` APIs do nothing on v8.
- Spritesheet frame names are global across atlases; keep them unique (doc 07).
- Pixi draws text with whatever font is loaded at that moment; the boot waits for the four critical fonts
  (up to 3 s) before mounting a Pixi screen.
