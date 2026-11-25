# 05. Loading and performance

How a game goes from "URL opened" to "player can act", which files do it, the measured results and the
rules every game follows. Raw measurements, dependency maps per game and every test run are kept in
[archive/loading-audit/](archive/loading-audit/).

## The one metric

**Time to playable** (`pbf:playable` mark): game screen mounted, loading overlay gone, first frame drawn
(Pixi games: the critical canvas has drawn), so a tap reaches the game. Bundle size, request count and the
loading bar exist to serve this number.

## Startup lifecycle

```
HTML (inline loader painted, no script needed)
 ├─ <script> boot JS + React                          ┐
 ├─ modulepreload: screen code (+ Pixi chunks)        │ all start together, from the HTML
 ├─ preload: 4 critical fonts (WOFF2)                 │ (vite.config.ts "startup-hints")
 └─ preload: screen CSS                               ┘
GameBoot (pbf:bootstrap)
 ├─ session init (15 s timeout) ───────────────────────┐ pbf:session
 ├─ fonts ready (3 s cap, never fatal) ────────────────┤ pbf:fonts
 ├─ loadScreen() ──────────────────────────────────────┤ pbf:code
 ├─ Pixi games: critical assets (runQueue) ────────────┤ pbf:critical-assets
 └─ Pixi games: WebGL probe in idle time ──────────────┘ pbf:renderer-warm
pbf:critical → screen mounts UNDER the loading overlay
 ├─ DOM game: next painted frame
 └─ Pixi game: <PixiStage critical> creates the renderer (pbf:renderer), builds the scene (pbf:scene),
    draws the first frame (pbf:first-render)
pbf:playable → overlay removed; optional decoration (desktop background) starts loading
```

All marks are `performance.mark('pbf:<stage>')`, visible in the DevTools Performance panel.

## Parts

| Part | File | Responsibility |
|---|---|---|
| Inline loader | `index.html` | Painted with the HTML, before any script. Indeterminate bar (nothing is measured yet). Empty favicon (no 404 request). |
| Startup hints | `vite.config.ts` (`startup-hints`) | Game title; `modulepreload` for the screen chunk, plus Pixi chunks for Pixi games only; `preload` for the four critical fonts and the screen CSS. |
| Loading lifecycle | `src/core/boot/GameBoot.tsx` | Starts all critical work in parallel, shows real progress, mounts the screen under the overlay, removes it at first frame, shows error screens. Never imports Pixi. |
| Marks + ready signal | `src/core/boot/startup.ts` | `markStartup`, `reportCriticalScene`, `onCriticalScene`. |
| Load queue | `src/core/boot/loadQueue.ts` | `runQueue` (bounded concurrency 6, de-duplication, per-attempt timeout, one retry, abort, progress), `withTimeout`, `LoadError`. Self-check: `loadQueue.check.ts`. |
| Asset URLs | `src/core/boot/assetUrl.ts` | URLs valid at any deployment path, with `?v=<content hash>` (see doc 07). |
| Pixi preload | `src/core/pixi/preload.ts` | Registers aliases once, loads them through `runQueue`. Imported dynamically, only by Pixi games. |
| Renderer warm-up | `src/core/pixi/warmup.ts` | Runs Pixi's cached `isWebGLSupported()` probe while the network is busy. |
| Critical stage | `src/core/pixi/PixiStage.tsx` (`critical`) | Draws the first frame synchronously after the scene is built, then reports ready (or failed). |

## Progress

Item-weighted and real: 1 unit per font, per critical asset and for the session, 2 for the screen code,
1 for the first frame of a Pixi game. It reaches 100% only at `pbf:playable`. It is not byte-weighted.

## Failures and timeouts

| Case | Behaviour | Player sees |
|---|---|---|
| Font fails or takes over 3 s | warning, fallback font | game starts |
| Critical asset fails | one retry, then fail | "Unable to load" + Reload |
| Critical asset hangs | 15 s per attempt, one retry | progress stops, "Unable to load" after about 30 s |
| Screen code fails | fail (browsers cache failed module loads) | "Unable to load" + Reload |
| Session `ApiError` | mapped to its code | maintenance / session expired / unable to start |
| Session over 15 s | fail | "Taking too long" + Reload |
| Pixi renderer cannot start | stage reports failure, overlay removed | the game's own stage-error fallback |
| Critical stage never reports (game bug) | overlay removed after 10 s, console warning | the game |

All of these were exercised in a browser with fault injection (results in
[archive/loading-audit/LOADING_TEST_RESULTS.md](archive/loading-audit/LOADING_TEST_RESULTS.md)).

## Measured results

Chrome 158 via DevTools, local static server (HTTP/1.1, gzip, ETag), only the measurement tab open.
Time to playable in ms; cold = fresh browser context, warm = second visit. Before = the builds before the
loading work, after = the loading work (later changes such as the compact layout were not re-measured).

| Game | Profile | Cold before | Cold after | Warm before | Warm after |
|---|---|---:|---:|---:|---:|
| Higher or Lower | Fast 4G | 2819 | 1550 | 1249 | 537 |
| Higher or Lower | Slow 4G | 8222 | 5347 | 3150 | 996 |
| Higher or Lower | mobile (Fast 4G, 4x CPU) | 2537 | 2119 | 2518 | 2970 |
| Acca Crash | Fast 4G | 1795 | 1520 | 582 | 480 |
| Acca Crash | Slow 4G | 5861 | 4132 | 1525 | 931 |
| Acca Crash | mobile | 1994 | 1820 | 2641 | 2287 |
| Last Man Standing | Fast 4G | 1243 | 786 | 424 | 375 |
| Last Man Standing | Slow 4G | 4058 | 2932 | 1317 | 835 |
| Last Man Standing | mobile | 1210 | 1208 | 1195 | 886 |

First visible loader: 590 to 830 ms before, 200 to 230 ms after (Fast 4G); 2240 to 2280 ms before,
610 to 820 ms after (Slow 4G). Run-to-run variance on the test machine was large (the same build measured
2157 to 3002 ms), so single-run differences under about 300 ms are noise; mobile emulation is the noisiest
(the 4x CPU slowdown also stretches synchronous GPU calls).

Targets: warm under 500 ms met for Last Man Standing (375) and Acca Crash (480), Higher or Lower 513 to
560; Fast 4G cold under 1 s met only by Last Man Standing; Slow 4G under 2 s not met (the first screen needs
225 to 370 KB, 1.2 to 2.5 s of transfer at Slow 4G speed).

## What changed and why (largest measured effect first)

| Change | Effect |
|---|---|
| Inline HTML loader | Loader visible about 350 ms (Fast 4G) and 1.5 s (Slow 4G) earlier |
| Everything critical starts from the HTML | Removed the second waterfall: Pixi chunks used to start only after the screen mounted (450 ms Fast 4G, 1.5 s Slow 4G) |
| Screen split from the boot (`loadScreen`), boot never imports Pixi | Last Man Standing JS 178 KB to 104 KB with no Pixi at all |
| Versioned, immutable public assets | Warm loads without 304 round trips (HL warm 1249 to 537 ms Fast 4G, 3150 to 996 ms Slow 4G) |
| Game atlas for HL badges | 150 KB, 1229x2032 shared atlas replaced by a 28 KB PNG (also a 10 MB GPU texture avoided) |
| WOFF2 fonts, SVGO on flags | Fonts 162 to 119 KB; Spain flag 55.6 to 19.8 KB gz |
| WebGL warm-up | Stage creation after data: about 500 ms to 70 to 200 ms (desktop) |
| Overlay until first frame | Loader no longer disappears onto a screen without a canvas (was a 490 ms gap on HL, 1070 ms on Acca) |
| Fonts non-fatal, relative asset URLs | A font 404 or a subfolder deployment used to stop the game completely |
| Desktop background deferred, never on phones | 52 KB off the critical path |

Tried and reverted (measured worse): one forced Pixi chunk (moved Vite's preload helper into it, so DOM
games loaded Pixi); `fetchpriority=low` on Pixi renderer chunks (Acca Crash about 650 ms slower on Slow 4G).

## Rules for every game

- `index.ts` stays light: no screen or scene imports; asset lists come from config files.
- Pixi games: `renderer: 'pixi'`, exactly one `<PixiStage critical>` on the first screen.
- `preload` lists only what the first screen draws; everything else loads after `pbf:playable`.
- Assets through `assetUrl()`; never `/assets/...`.
- Budgets: Fast 4G cold 1.5 s or less, warm 0.5 s or less, first-screen assets 150 KB or less.
- Measure a new game with the method in [10-TESTING-STANDARDS.md](10-TESTING-STANDARDS.md).

## Known limitations and pending work

- Measured over HTTP/1.1 only; HTTP/2 or HTTP/3 hosting is expected to be the biggest production gain
  (14 small files on HL queued behind 6 connections) but is unmeasured.
- The `?v=` immutable caching needs a host rule (doc 07).
- Fonts (119 KB) gate Pixi games on slow links; no subsetting yet (needs the glyph list per language).
- Last Man Standing's boot JS is mostly bundled mock data (155 KB raw); a real client will not ship it.
- Each game is its own build at its own path, so shared files are cached per game, not across games.
- `pbf:playable` is also marked when the critical stage fails (overlay removed so the fallback shows).
- Mobile figures come from CPU emulation only; no real low-end device was measured.
- The loading numbers predate the compact layout (doc 06); they were not re-measured after it.
