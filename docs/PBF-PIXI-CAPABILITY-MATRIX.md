# PBF Pixi capability matrix

Master checklist for moving the Pixi capabilities of the first PBF game (`pbf_ultimatesoccer_fe_v1`, the legacy
framework) into the shared core of this framework. Every legacy capability ends up in one of three states:
**implemented**, **replaced**, or **excluded with a technical reason**. Update this file with each phase.

**React first, in every phase.** React owns the game shell, screens, layout, controls, dialogs, text, loading and
error states, and accessible interaction. The game's React and TypeScript layers own state, rules and backend calls.
Pixi owns only bounded visual scenes (the card reveal, the curve, Spine and particle effects): React passes typed
props in and the scene emits typed events out. Legacy Pixi wrappers and services are carried for use inside those
scenes. A legacy Pixi button, popup or list that serves the game UI is not carried into a scene: it stays in React
(see the Phase 4 and 7 rows). A new Pixi game is scaffolded from a React screen, with a Pixi scene added where needed.

Rules (from the working agreement): adapt the copy of the legacy code in `legacy/corelib` in place, not new files from
scratch; keep the legacy filename where the responsibility is equivalent; new names only
when there is no equivalent; Pixi 8 (8.9.2) APIs only; effects run inside the existing `PixiStage` (no extra WebGL
Applications); Spine and `@pixi/ui` stay lazy-loaded; the DOM game never loads Pixi; backends stay per game.

Status: `done` built and checked, `partial` some parts built, `open` not started, `excluded` will not be carried.
"Evidence" is what proves the row; a row is not `done` without it.

## Phases

| Phase | Scope | State |
|---|---|---|
| 1 | Foundation | done, uncommitted |
| 2 | Spine | done in the browser harness (2026-11-26), see "Phase 2 results"; uncommitted |
| 3 | Assets, display wrappers, layout | done in the browser harnesses (2026-11-26), see "Phase 3 results"; uncommitted |
| 4 | Interaction inside scenes | done in the display harness (2026-11-26), see "Phase 4 results"; uncommitted |
| 5 | Audio | done in the audio harness (2026-11-26), see "Phase 5 results"; uncommitted |
| 6 | Host bridge | done in the host harness (2026-11-26), see "Phase 6 results"; uncommitted |
| 7 | Scroll, list, dynamic sprite, FPS meter | done in the display harness (2026-11-26), see "Phase 7 results"; uncommitted |
| 8 | Proof: a fourth Pixi game from the documented workflow | done (2026-11-26), see "Phase 8 results"; uncommitted |

## Matrix

| Legacy file | New equivalent | Status | Remaining work | Phase | Evidence |
|---|---|---|---|---|---|
| `AnimationServiceProxy.ts` | `core/pixi/AnimationServiceProxy.ts` | done | none | 1 | `AnimationServiceProxy.check.ts` |
| `GameConfigProxy.ts` | `core/pixi/GameConfigProxy.ts` | done | none | 1 | `GameConfigProxy.check.ts` |
| `LoggerService.ts` | `core/utils/LoggerService.ts` | partial | add a self-check | 1 | none yet |
| `PixParticleComp.ts` | `core/pixi/wrapper/PixParticleComp.ts` (+ `PixParticleStep.ts`) | done | none | 1 | `PixParticleComp.check.ts` |
| `PixSpine.ts` | `core/pixi/wrapper/PixSpine.ts`, adapted from the legacy file (+ `PixSpineStep.ts` for the pure numbers) | done | adapted from the legacy file; playback, reverse, mix, queue, events, skins, slots, fit and pause proven in Chrome | 2 | `PixSpine.check.ts`; `tests/e2e/spine.spec.ts` (8 harness tests pass) |
| `AssetLoader.ts` (spine branch), ad hoc `Assets.add` in `gameApp.ts` | `core/pixi/wrapper/SpineAssets.ts` (registry), `SpineAssetBackend.ts` (Pixi side), `SpineRuntime.ts` (lazy loader) | done | legacy alias names `<id>Data` and `<id>Atlas`; the legacy loader has no equivalent of stage-owned, ref-counted release, so these are new files | 2 | `SpineAssets.check.ts`; harness: sharing, release, remount, shared atlas, unmount during load |
| `UIUtilService.ts` Spine element (`type: 'Spine'`) | `buildView` `spine` element: an empty labelled container the scene fills with `PixSpine.create` | done | none | 3 | `viewConfig.check.ts` |
| `AssetLoader.ts` (rest), `AssetsBaseService.ts` | `core/pixi/AssetLoader.ts` adapted from the legacy file (+ `AssetLoaderStep.ts`, `AssetRegistry.ts`); `assetUrl` already versions paths | done | kinds image, atlas, sequence, font, bmpfont; `{res}` variants; bundles; leases with retry. Excluded: gif (needs `@pixi/gif`, no game uses it), background warm-up (acquire early), WrapperProxy progress calls | 3 | `AssetLoader.check.ts`; `tests/e2e/display.spec.ts` |
| `PixSprite`, `PixText`, `PixBMPText`, `PixGraphics`, `PixContainer`, `StandardView` | `core/pixi/wrapper/<same names>` adapted from the legacy files; `StandardView` excluded (BaseView family) | done | `PixContainer` is a plain Container with `configData` | 3 | typecheck, lint; used by `UIUtilService` in the display harness |
| `PixAnimatedSprite.ts` | `core/pixi/wrapper/PixAnimatedSprite.ts` adapted | done | speed from the sprite config `animationSpeed` (no global bag) | 3 | display harness: forward with repeat, reverse |
| `UIUtilService.ts` element factory, text, shapes | `core/pixi/UIUtilService.ts` adapted (texture, text fit, frames, shapes) and `buildView.ts` extended (`bitmapText`, `animatedSprite`, `spine`, shapes arc, polygon, gradientRect, `maxWidth`, `maxLines`, `wordWrapWidth`) | done | `getElement` and the old element types are replaced by `buildElements` | 3 | `viewConfig.check.ts`; display harness text fit |
| `UIUtilService.ts` layout (`alignHorizontal`, `scaleElement`, ...) | `core/pixi/layout.ts` (new: the legacy engine is portrait-only and rewrote its config) | done | `fitScale`, `stageFit`, `placeInBox`, `applyPlacement` | 3 | `layout.check.ts`; 10 viewports plus rotation in the display harness |
| `DeviceConfigProxy.ts` | `core/pixi/DeviceConfigProxy.ts` adapted (+ `DeviceConfigStep.ts`) | done | pixel ratio is the real ratio capped at 2 (legacy forced 2) | 3 | `DeviceConfig.check.ts`; harness reads `@1x` on desktop |
| `EventHandlerService.ts` | none: replaced by `ctx.emit` (scene to React) and `SoundManager.handle(event, param)` (screen to sound) | replaced | no global bus needed; revisit only if a scene-internal part must notify a sibling without React | 5 | audio harness event flow |
| `UIUtilService.ts` interaction (`setClickable`, `setHandCursor`, `setModalState`, `removeInteraction`, `resumeInteraction`, `addInteraction`, `addHover/Up/Down/Out/MouseUpOutside/MoveInteraction`) | same names on `core/pixi/UIUtilService.ts`, Pixi 8 pointer events, each returns its unsubscribe; plus new `bindInteractions` (+ `InteractionStep.ts`, `scene.ts` `ctx.input`) | done | `PixTabButton`, `PixFancyButton`, `PixToggleButton`, `PixButton`: not carried (below) | 4 | `Interaction.check.ts`, `viewConfig.check.ts`; `tests/e2e/interaction.spec.ts` (12 tests) |
| `PixTabButton.ts` | none yet | deferred | adapt the legacy file when a scene needs an in-canvas selector | later | n/a |
| `PixFancyButton.ts`, `PixToggleButton.ts`, `PixButton.ts`, UIUtil glow, pulse, grey-out | none | excluded | `PixFancyButton` needs `@pixi/ui` (no scene requires it); `PixToggleButton` has no users; `PixButton` is Pixi 7 style with an idle interval that is never cleared; the glow and grey-out filters need `pixi-filters`; game buttons and toggles are React | n/a | documented |
| `SoundServiceProxy.ts`, `SoundManager.ts` | `core/audio/SoundServiceProxy.ts` and `SoundManager.ts` adapted (+ `SoundConfig.ts`, `SoundStep.ts`, `react.ts`) | done | Web Audio, lazy, renderer-independent; one service per screen; unlock with retry; settings in React; legacy names kept; legacy mute bug fixed | 5 | `Sound.check.ts`; `tests/e2e/audio.spec.ts` (10 tests) |
| `WrapperServiceProxy.ts` | `core/host/WrapperServiceProxy.ts` adapted (+ `HostMessages.ts`, `HostAdapter.ts`, `react.ts`) | done | the generic part only: handshake, balance, sound toggle, popup, snackbar, progress, client ready, app height, reload, banking, close, logout, and the host messages audio on or off, stop, resume, reloaded. Operator adapters (Games Global, GameFlex, Aristocrat) are deferred behind `HostAdapter`: each needs its own message audit and tests (Q10). Not carried: all Ultimate Soccer screen, FTUE, betting and team messages, `window.gameExtension`, and the hard-coded fallback token | 6 | `Host.check.ts`; `tests/e2e/host.spec.ts` (8 tests) |
| `ScrollBox.ts`, `List.ts`, `trackpad/*` | `core/pixi/wrapper/ScrollBox.ts`, `List.ts`, `trackpad/{Trackpad,SlidingNumber,ScrollSpring,Spring}.ts` copied from the legacy files and adapted; one new file `trackpad/Signal.ts` replaces `typed-signals` (no dependency) | done | for a strip or list drawn inside a scene only; page scrolling and page lists stay React. Added: `ticker` option (the stage's own, so pause stops momentum), `isBlocked`, `onDragClaim` signal, `isMoving`, timer and listener cleanup. Removed: synthetic null `pointerupoutside` events. Not exercised: vertical type, scrollbar, `scrollTo`, proximity signals (kept as legacy, no scene needs them yet) | 7 | `tests/e2e/scroll.spec.ts` (10 strip tests) |
| `PixDynamicSprite.ts` | `core/pixi/wrapper/PixDynamicSprite.ts` adapted (+ `PixDynamicSpriteStep.ts` for URL rules and fitting) | done | a lease on the shared registry machinery keyed by URL (one request per URL, last release unloads); only http(s) image URLs from the page origin or `allowedOrigins`; fallback on failure; a URL change or destroy while loading is ignored when the image arrives. Gone: global protect registries, loader sprite, CORS-retry callback, BaseView parent | 7 | `PixDynamicSprite.check.ts`; `tests/e2e/scroll.spec.ts` (8 sprite tests) |
| `FPSMeterView.ts` | `core/pixi/FPSMeterView.ts` adapted | done | reads the stage ticker, removes its callback on destroy; `showFpsMeter` returns null unless a dev build and `?fps=1`; its code is not in any production bundle | 7 | `tests/e2e/scroll.spec.ts` (3 meter tests; a second harness build with `DEV` on) |
| `PreloaderScreen.ts` | `core/boot/GameBoot.tsx` overlay | done (replaced) | none | n/a | existing e2e |
| `ClassUtil.ts`, game class factory | scene factory passed to `PixiStage` | done (replaced) | none | n/a | both Pixi games |
| `MessageServiceProxy.ts`, `AppModelService.ts`, GraphQL client, `SocketService.ts`, `ErrorCodes.ts` | none | excluded | none | n/a | each game owns its backend; these are the legacy game's own API, wallet and betting code |
| `BaseView.ts`, `BaseContainer.ts`, `BaseScreen.ts`, `ResponsesiveView.ts`, `ResponsesiveChildrenView.ts` | scene contract + config-driven `buildView` | excluded | none | n/a | base-class screens tied to global singletons; resize listeners were never removed |
| `PixButton.ts`, `PixDualImage.ts`, `PixBitmapText.ts` | none | excluded | none | n/a | Pixi 7 style or unused orientation hacks |
| `GameView.ts`, `ModalPopup.ts` | none | excluded | none | n/a | global stage registry; React owns UI and popups |
| `SoundServiceProxyPixi.ts`, legacy `PixParticleComp` library | none | excluded | `@pixi/sound` and `@pixi/particle-emitter` only work with Pixi 7; Howler is replaced by Web Audio (no dependency) | n/a | documented |

## Phase 8 results (2026-11-26, uncommitted)

The workflow proof: `npm run new-game` gained `--scene` and `--sound` (docs/03), `npm run verify-scaffold` proves all four variants on a clean copy, and a permanent
fourth game, `cardpick`, was made with `new-game cardpick "Card Pick" --scene --sound` and then filled in. New files, each for a new responsibility:
`scripts/verify-scaffold.mjs` (the proof), `src/games/cardpick/*` (the game), `public/assets/cardpick/*` (the 28 KB PBF badge atlas copy and two short sounds in mp3 and ogg),
`tests/e2e/cardpick.spec.ts`. `core/services/mockTransport.ts` gained `mockRandom` (`?mockSeed=N`, mock only) so browser tests can repeat a server draw.

`verify-scaffold` (copies the project without `node_modules`, `legacy` and builds, runs `npm ci`, scaffolds the four variants, runs `npm run check`, `tsc`, `lint` and the
builds) asserts the boot of every variant loads neither Pixi nor audio, the screen of a `--scene` game loads Pixi and a plain or `--sound` one does not, the screen of
a `--sound` game loads the audio code and no other build contains it, and each flag produces exactly its files.

`tests/e2e/cardpick.spec.ts` (7 tests): a canvas tap and the keyboard button give the same result and balance for the same seeded draw; each card can be picked from
the canvas; a second pick while the server answers does nothing and takes one stake; a pick is audible (measured on the output) and mute silences it and survives a reload;
the sound files are fetched with the screen, not before; cardpick code and art are in no other game's build and no other game's in its build; Last Man Standing loads no
Pixi, Spine or audio code, Higher or Lower no audio or Spine code. Cardpick is also in `GAMES`, so the shared specs (loads clean from a subfolder, a click changes state,
layout at every size, resize with no leaked listeners, the crash screen) run on it too.

## Phase 7 results (2026-11-26, uncommitted)

Scene utilities for a strip drawn inside a Pixi scene, remote images and a dev meter. React keeps page scrolling, page lists, and every control. Proven in the
display harness (stage `R` the strip, stage `D` remote sprites; `npm run build:harness` also builds `displayharnessdev`, the same page with `DEV` on).

The drag arbitration rule: a press that moves past the 10 CSS px tap threshold belongs to the strip. `ScrollBox.onDragClaim` fires and the scene calls
`binding.cancelPointer(id, 'claimed')`, so the card gets `press` then `cancel:claimed` and never a tap; a press that lands on a coasting strip stops it and is not a tap.

`tests/e2e/scroll.spec.ts` (21 tests): wheel scroll with clamps at both ends; tap is a tap and does not move the strip; 6 px of movement is still a tap, a longer
drag scrolls and selects nothing; a drag that ends over another card selects neither; a press on a coasting strip holds it still and is not a tap; cards outside
the view (and the clipped part of a cut card) cannot be selected; pause freezes momentum and ignores the wheel; unmount removes the document wheel listener and
destroys the strip, remount has exactly one listener; resize keeps taps working; touch drag and touch tap; remote images: cross-origin load fitted to its
rectangle and reported once, forced stretch, a 404 shows the fallback and holds no reference, refused origins, non-image URLs and `javascript:` make no request, one request for two
sprites on one URL and release on the last, URL change while loading (the old result is ignored and freed), destroy while loading, stage unmount; the FPS meter
shows only in a dev build with `?fps=1` and removes its ticker callback, and no production bundle (harness or game) contains it.

Deferred (reason, trigger): vertical strips, scrollbar, `scrollTo` and proximity signals are legacy code kept as is, with no scene using them: add tests when
a game needs one. `PixTabButton` and the `@pixi/ui` buttons stay deferred (Phase 4).

## Phase 6 results (2026-11-26, uncommitted)

The host bridge (`core/host`, lazy, no dependency) lets a framed game and its host page exchange a small typed set of one-way messages. Rules:
explicit allowed origins (an empty list is inert; `*` and paths are refused); every inbound message must come from an allowed origin and the host window;
the first valid `HOST_INIT` binds that origin and window and only they are heard afterwards, and outbound goes to the bound origin; the first greeting is
addressed to the host origin the browser reports, or to each allowed origin on its own, never `*`; data is validated and a credential-like key is refused both
ways; no request ids or pending requests. `check:games` rule 15 forbids a `postMessage` to `*` in `core/host`.

`tests/e2e/host.spec.ts` (8 tests; the host page is on `127.0.0.1`, the game in an iframe on `localhost`, a rogue frame on the host's own origin and one on
`[::1]`): handshake and typed messages both ways, every post addressed to the host origin; with several allowed origins the browser reports the host, and
without discovery each allowed origin is addressed alone; a wrong origin, a wrong window with an allowed origin, a message before `HOST_INIT`, plain text, a
missing or wrong protocol, an unknown name, wrong data and a credential-like key are each rejected with the right reason and never reach a handler, before
and after the handshake, and the binding survives them; an empty allowlist sends and accepts nothing; a game outside a host page is inert; an adapter
changes only the shape of messages while validation and binding still apply; a token or an invalid payload is never sent (it throws); the bridge code loads only when
it connects, dispose ends listening and sending, and 20 connect and dispose cycles leave no net `message` listeners.

## Phase 5 results (2026-11-26, uncommitted)

Audio is a lazy, renderer-independent service (`core/audio`, Web Audio, no dependency). React owns the controls (mute, volume, sound effects,
ambient) and the screen turns its typed scene events into sounds with `SoundManager.handle`. New `check:games` rules 13 (`core/audio` never imports
Pixi) and 14 (the boot never imports `core/audio` or `core/host` statically) fire on probe files.

`tests/e2e/audio.spec.ts` (10 tests, Chrome, playback measured with an AnalyserNode on the output; Chrome under automation lets every page play, so the
browser's autoplay policy is modelled in the test): the audio chunk and the sound files load only when audio is used and no Pixi or Spine comes with
them; locked until the first gesture, a sound effect asked for while locked is dropped and a waiting looping ambient track starts at unlock and
the unlock listeners are removed; a failed resume keeps the listeners and the next gesture (a key) retries; audible playback, retrigger leaves one
instance, `dontStopInstances` overlaps, `matchParam` routes, ambient is exclusive and loops, a fade-out ends in silence, a stop event silences; mute, volume,
sound-effect and ambient controls change the measured output; settings persist across a reload, and with blocked storage they work for the
session and reset on reload; a hidden tab suspends and returning resumes without replaying, a muted user stays muted; a missing file is retried
once and an undecodable one is skipped, each with one warning and silence; ogg first, mp3 when ogg is not supported; 20 create-and-remove cycles leave
no net listeners, close every context, and a disposed service does nothing and tells nobody.

## Phase 4 results (2026-11-26, uncommitted)

Scope: make a scene object tappable and report the action to React, proven in the display harness (stage `T`). React keeps game buttons,
menus, dialogs and navigation. Rule: any essential canvas action also exists as a keyboard-accessible React control that calls the same
handler (the harness's twin buttons). No game uses it yet; the three games are unchanged.

| Gate | Result |
|---|---|
| `npm run typecheck`, `npm run check` (20 self-checks, incl. `Interaction.check`), `npm run lint` | pass |
| `npm run build` (3 games) and `npm run build:harness` | pass |
| `npm run test:e2e` | 71 pass, 0 fail: the previous 59 plus 12 interaction tests |
| `npm run bundle-report` | boot chunks unchanged: Higher or Lower 157.5 KB, Acca Crash 156.2 KB, Last Man Standing 293.1 KB raw |

`tests/e2e/interaction.spec.ts` proves: a mouse click and a touch tap each give one `tap` with the right pointer type and a design position (touch
gives no hover); a press that moves over 10 CSS px is a drag, a release outside cancels; disabling mid-press cancels once and enabling restores;
pausing, a hidden tab and a lost WebGL context cancel a press and block input until they end; a system `pointercancel` (CDP `touchCancel`)
cancels; two fingers on two objects are independent and a second finger on a pressed object is ignored; hit areas grow by `hitPadding` and to
44 CSS px (also at 202x356), neighbours split the gap, a corner object works; the twin button run from the keyboard (Enter, Space) calls the same
handler with no canvas input; remove, rebind, detach, destroy mid-press and binding a root twice each behave as specified; stage teardown mid-press
is silent and 20 mount and unmount cycles leave no net listeners on the window, the document or the canvas.

Findings: Pixi 8's event system does not turn the DOM `pointercancel` into an event on the object (it only maps the legacy `touchcancel`), so the
binding listens for it on the canvas itself; the harness test uses a detached object by reference, since a removed object can no longer be found by
its label.

## Phase 3 results (2026-11-26, uncommitted)

| Gate | Result |
|---|---|
| `npm run typecheck`, `npm run check` (19 self-checks, incl. `layout`, `AssetLoader`, `DeviceConfig`, `viewConfig`, `GameConfigProxy`), `npm run lint` | pass |
| `npm run build` (3 games) and `npm run build:harness` (Spine and display harnesses) | pass |
| `npm run test:e2e` | 59 pass, 0 fail (including 8 display harness, 8 Spine harness, 4 licence notice and 3 game-isolation tests) |
| Spine harness (8 tests) and game isolation (Last Man Standing: no Pixi, no Spine; Higher or Lower and Acca Crash: no Spine) against fresh builds | pass |
| `npm run bundle-report` | boot chunks: Higher or Lower 157.5 KB, Acca Crash 156.2 KB, Last Man Standing 293.1 KB raw (unchanged). Two separate facts about Spine in the Pixi games: (1) their builds contain a lazy 191.6 KB Spine chunk, which is why those distributed builds carry `THIRD-PARTY-NOTICES.txt` (Last Man Standing has no Spine code and no notice); (2) in the tested flows they make no Spine network request, which verifies the lazy loading |
| `check:games` rule 12 (nothing under `src` or `tests` imports `legacy/`) | pass; fires on a probe import |

Display harness (`tests/e2e/display.spec.ts`) proves, with PBF game 1 art: bundle loading and release (atlas frames, bitmap font uninstalled, canvas
font removed, a fresh mount draws); two stages share one request per file and releasing one leaves the other drawing; bundles that overlap on an
alias release independently and an unknown bundle names the bundles that exist; a sequence loads one sheet per `{n}` by resolution; a failing file
is retried once (two requests), the stage reports `assets`, nothing stays held after unmount, and a transient failure succeeds on the retry; the
scene stays inside the canvas, centred and at the `stageFit` scale across 10 viewports (202x356 to 1920x1080 and rotated) without re-creating the
canvas; text shrinks to its `maxWidth` and `maxLines`; the animated sprite repeats and reverses; frame-name lists match the legacy rules.

Changes made to proven Phase 2 code: the lease registry moved to `AssetRegistry.ts` and `SpineAssets.ts` became a thin instance of it (its
self-check passed unchanged), `PixSpineStep.fitPlacement` now uses `layout.fitScale`, and `PixiStage` takes its asset lease from
`AssetLoader` (`stageAssets.ts` is now one re-export). The earlier `loadStageAssets` / `unloadStageAssets` pair is gone.

## Phase 2 results (2026-11-26, uncommitted)

Package: `@pixi/spine-pixi` 2.1.1 (exact pin) with `@esotericsoftware/spine-core` 4.2.120 on Pixi 8.9.2 (deduped). Licence: Pixentech
confirmed the Spine Runtimes License terms. All 14 skeletons of the first PBF game (`.json` and `.skel`) are Spine 4.2.38.
`TrackEntry.reverse` is present and verified in the browser.

Commands (clean checkout): `npm install`, `npm run build` (the three games), then `npm run test:e2e`. `test:e2e` builds the Spine
harness itself (`npm run build:harness`) before running Playwright.

| Gate | Result |
|---|---|
| `npm run typecheck` | pass |
| `npm run check` (16 self-checks, including `SpineAssets.check`, `PixSpine.check`, `viewConfig.check`) | pass |
| `npm run lint` | pass, 0 warnings |
| `npm run build` (3 games) and `npm run build:harness` | pass |
| `npm run test:e2e` | 47 pass, 0 fail |
| Spine harness (`tests/e2e/spine.spec.ts`, 8 tests) | all pass |
| Last Man Standing requests no Pixi and no Spine; Higher or Lower and Acca Crash request no Spine | pass |
| `npm run bundle-report` | boot chunks: Higher or Lower 157.5 KB, Acca Crash 156.2 KB, Last Man Standing 293.1 KB raw. The Spine runtime is its own 191.6 KB chunk in the two Pixi games' builds and is never requested unless a stage lists Spine |

What the harness proves with real PBF assets: the runtime loads only when a stage lists Spine; a stage draws and fits the skeleton; forward and
reverse playback complete (reverse fires no animation events, as Spine documents); mixing by pair, default and override; queueing; listeners
unsubscribe and leave none behind on destroy; skins, slots, errors; two stages share one asset and one load; closing one leaves the other drawing
and animating; the last release frees the textures and a fresh mount draws again; two assets with different skeletons and one atlas survive either
closing first; unmounting while loading releases without errors; a paused stage and a hidden tab stop the animation, and resuming does not jump.

Findings that shaped the code (also in file headers and comments):

- Spine registers its render pipe when it loads, and a renderer only picks up pipes registered before the Application exists, so `PixiStage`
  loads the runtime before `app.init`, for stages that list Spine only.
- Spine applies a pose at render time, and an animation that was never applied is skipped when replaced: mixing needs a rendered frame between plays.
- `Spine.from` keeps the parsed skeleton data in Pixi's global `Cache`; the backend drops that entry on release, otherwise a later load draws
  destroyed textures.
- Unloading an atlas alias leaves its page textures behind; the backend releases them. An atlas shared by two assets is released only with the last.
- `Assets.unload` warns when another alias already removed a cache key, so the backend unloads atlas files through the loader.
- `attach` (slot objects) makes the runtime emit a Pixi deprecation warning; the runtime does this itself.
- Importing `pixi.js` dynamically from a module that Pixi games load statically merged Pixi's renderer chunks (the "renderer chunk fails" test
  caught it); the backend now imports Pixi statically.

Earlier in the run, three "a screen that crashes while rendering" tests in `tests/e2e/failures.spec.ts` failed for a reason unrelated to Spine:
they provoked the crash with `?currency=COINS`, but `formatMoney` (committed in db163bc) no longer throws for a bad currency. The tests now
force the failure by making `Intl.NumberFormat` throw for currency and 2-decimal formats, so the screen throws while rendering.

Lazy rule, enforced by `npm run check:games` (rule 11): nothing imports the Spine package statically, and only
`src/core/pixi/wrapper/SpineRuntime.ts` may `import()` it. `import type` is allowed.

## Browser gate (after commit 5f12f78)

- Fresh `npm run build` of all games, then `npm run test:e2e`: 126 passed, 0 failed, run twice (the second with the reworked mute test).
- The earlier Spine pause failure (`spine.spec.ts` "a paused stage and a hidden tab...") and the audio mute failure did not reproduce: the spine and audio
  specs also passed 25 of 25 with eight busy node processes competing for the CPU. The cause of the earlier failures is not proven; they happened while an
  unrelated dev server and other node processes were running. If the Spine pause test fails again, capture `trackTime` per 100 ms before changing any timeout.
- The audio mute test no longer sleeps for fixed times: it polls the analyser until it is silent after mute, and until it recovers after unmute.
- Still unverified (no scene uses them): vertical `ScrollBox`, the scrollbar, `scrollTo` and the proximity signals. `--sound` scaffolds the wiring with an empty sound list.
