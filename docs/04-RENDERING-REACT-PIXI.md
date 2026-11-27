# 04. Rendering: React and PixiJS

React owns the application: screens, layout, controls, state and backend calls. PixiJS (8.9.2) renders only
canvas gameplay and heavy effects. This doc covers how the two connect and the rules for canvas code.

## When to use what

| Need | Use |
|---|---|
| Buttons, panels, text, counters, stamps, transitions | React + CSS (no animation library is installed) |
| A small one-off canvas effect (confetti, glow) | draw it inside the scene's existing stage: `startBurst` (`src/core/pixi/wrapper/PixParticleComp.ts`), numbers in the game's `pixi/config/game.config.ts`. `usePixiEffect` opens its own Application and is only for a separate canvas |
| A gameplay surface with state or events (card flip, crash curve) | a typed `PixiScene` class inside `<PixiStage>` |

A game that needs no canvas sets `renderer: 'dom'` and never downloads Pixi (Last Man Standing). The boot
itself never imports Pixi (doc 05).

## The pieces

| File | Role |
|---|---|
| `core/pixi/PixiStage.tsx` | React component that owns one Pixi `Application` per mount and runs a scene in it |
| `core/pixi/scene.ts` | Scene contract: `PixiScene`, `SceneContext`, `SceneFactory`, `StageAsset` |
| `core/pixi/usePixiEffect.tsx` | Wraps a draw function in its own stage (a second Application); ordinary effects use `startBurst` inside the scene instead |
| `core/pixi/CanvasFrame.tsx` | The canvas box: height from a view config, or `fill` to fill a layout slot |
| `core/pixi/viewConfig.ts` | Typed config shapes (canvas portion, text/sprite/shape/group elements) and validators |
| `core/pixi/buildView.ts` | `buildElements(config, data)`: config element list to Pixi objects, with data binding |
| `core/pixi/theme.ts` | `COLORS`, `FONTS`, `TIER_COLORS` as Pixi values (names match the CSS tokens) |
| `core/pixi/stageAssets.ts`, `preload.ts`, `warmup.ts` | Ref-counted stage assets, boot preload, WebGL warm-up (docs 05, 07) |
| `core/pixi/AnimationServiceProxy.ts` | Tweens and easings without an animation library (`tween`, `wait`, `killTweensOf`, `ease`, `window01`; the old `AnimationProxy` method names and gsap ease strings are accepted). One ticker callback per stage, stopped on unmount |
| `core/pixi/wrapper/PixParticleComp.ts` | `startBurst(ctx, config)`: a particle burst inside the existing stage (physics in `PixParticleStep.ts`) |
| `core/pixi/GameConfigProxy.ts` | `PixiGameConfig` (preload, effects; later spine, sounds, host) and `validatePixiConfig`. A game writes `{ ... } satisfies PixiGameConfig` in `pixi/config/game.config.ts` |
| `core/utils/LoggerService.ts` | `Logger` and `warnOnce` |
| `core/hooks/useStageStatus.ts` | The shared `onError` and `onRecovered` props of a stage |

**Rule for every game and every phase:** React is the default. React owns the shell, screens, layout, controls,
dialogs, text, loading and error states and accessible interaction; the game's React and TypeScript layers own state,
rules and backend calls. Pixi owns only bounded visual scenes (the card reveal, the curve, Spine and particle
effects). React passes typed props to the scene and the scene emits typed events back. A legacy Pixi button or popup
that serves the game UI stays in React. The master checklist of carried legacy capabilities is
[PBF-PIXI-CAPABILITY-MATRIX.md](PBF-PIXI-CAPABILITY-MATRIX.md).

## Assets, display wrappers and layout (inside a canvas)

React lays out the page and the canvas box. These serve only what is drawn inside a canvas:

- **Assets.** A game declares them in `pixi/config/game.config.ts` (`PixiGameConfig`: `assets`, `bundles`, `spine`, `design`).
  `AssetDef` kinds: image, atlas, `sequence` (`{n}` sheets), canvas `font`, `bmpfont`; `src` may hold `{res}` (`@1x` or `@0.5x`).
  `<PixiStage assets={...} spine={...}>` takes a lease before the scene starts and releases it after the Application is destroyed; a
  scene can also take bundles with `AssetLoader.acquireBundles`. Leases are ref-counted per alias (two stages share one load), a file
  gets a timeout and one retry, a failure is `StageError` kind `assets`, and a failed or half-loaded asset is cleaned up on release.
  Core: `AssetLoader.ts` (adapted from the legacy loader), `AssetRegistry.ts` (the ownership rules, shared with Spine).
- **Display wrappers.** `core/pixi/wrapper/PixSprite`, `PixText`, `PixBMPText`, `PixGraphics`, `PixContainer`, `PixAnimatedSprite` and
  `core/pixi/UIUtilService.ts` (texture lookup, text that shrinks to `maxWidth` or `maxLines`, frame lists, shapes), adapted from
  the legacy files. `buildElements` also builds `bitmapText`, `animatedSprite` and a `spine` placeholder, plus the arc, polygon and
  gradient shapes.
- **Layout.** `core/pixi/layout.ts`: pure `fitScale`, `stageFit` (letterbox a design size into the stage), `placeInBox` and
  `applyPlacement`. A scene lays out in design pixels and applies `stageFit(design, size)` from `resize(width, height)`.
  `DeviceConfigProxy` gives the asset resolution and device class.
- **Interaction.** For an object that is part of a scene's artwork and needs a tap: give its element an `interactive: { event }` block
  (`hitPadding`, `minTarget` in CSS px, default 44) and call, from the scene's `init`,
  `bindInteractions(host: InteractionHost, root: Container, elements: ElementConfig[], onEvent: (e: SceneInteraction) => void): InteractionBinding`
  on `UIUtil`, for example `UIUtil.bindInteractions(ctx, this.root, elements, (event) => ctx.emit({ type: 'interaction', event }))`
  (the scene's own event type wraps `SceneInteraction`), then `binding.refresh()` from `resize()` and `binding.setEnabled(target, bool)`
  from `update()`. `ctx` is an `InteractionHost` (`app`, `root`, `track`, `input`). The scene reports typed `SceneInteraction`
  events (`press`, `release`, `tap` with a design position, `hover`, `out`, `cancel` with a reason) and React acts on them.
  `ctx.input.blocked` (paused, hidden tab, lost context) cancels presses in progress. **Accessibility:** an essential action offered in the canvas
  must also be a keyboard-accessible React control calling the same handler. Game buttons, menus and dialogs stay React. The legacy names
  (`setClickable`, `addInteraction`, ...) are on `UIUtilService` for lower-level use.
- Browser proof: `tests/fixtures/display-harness` with `tests/e2e/display.spec.ts` and `tests/e2e/interaction.spec.ts`.

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
  rebuilds its Application and scene from the latest props, and calls `onRecovered` once the rebuilt scene has
  initialised, so a screen can clear its "display error" message on either path.
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

- **Config** `pixi/config/<name>.config.ts`: canvas portion (`canvas: { heightPct, minHeight, maxHeight }`, used
  when not in a layout slot), element list (positions, sizes, fonts and colours by theme name), timings,
  assets. This is the file to edit to change the canvas.
- **View** `pixi/view/<Name>Scene.ts`: `buildElements(config.elements, data)` builds the objects; each object is
  labelled with its config `id` (`getChildByLabel`). No literal sizes, colours, fonts or timings in the view.
- Element types: `text` (`text` or `bind`, optional `upper`), `sprite` (`alias`, may contain `{key}` tokens
  such as `{tier}Badge`), `shape` (`fill`, `fillBind` or `stroke`), `group` (children).
- `buildElements` validates a config once (unique ids, text has text or bind, sprites have an alias, shapes
  have a size); a missing texture or bind value warns once and draws nothing instead of throwing.
- Live drawings (the crash curve) stay in the view, but their padding, widths, colours and labels come
  from the config.
- Each Pixi game has a `pixi/config/config.check.ts` self-check that validates its configs in Node.

Reference implementations: `src/games/higherlower/pixi/` (card reveal: flip, staged reveal, OVR roll) and
`src/games/accacrash/pixi/` (`view/` + `config/`) (crash curve with a pulsing head, labels from config).

Pixi views in the current games (3 views in 2 games; each has its own config):

| Game | View | What it does | File |
|---|---|---|---|
| Higher or Lower | Card reveal | Flips the cards and runs the staged reveal (`PixiScene` class, `critical`) | `src/games/higherlower/pixi/view/CardRevealScene.ts` |
| Higher or Lower | Win confetti | One burst per won round, drawn inside the card stage with `startBurst` (no second canvas) | `src/games/higherlower/pixi/view/CardRevealScene.ts` |
| Acca Crash | Crash curve | Draws the live curve with a pulsing head (`PixiScene` class) | `src/games/accacrash/pixi/view/CrashCurveScene.ts` |
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
