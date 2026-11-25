# Loading performance: before and after

Metric: time to playable, in ms from navigation start (screen mounted, overlay gone, first frame drawn;
Pixi games: critical canvas present). Before = the builds as they were at the start of this work (kept
unchanged in a separate folder). After = final builds. Same server, same browser instance, same
network profiles, and only the measurement tab open (see `LOADING_TEST_RESULTS.md` for setup and raw runs).

Profiles: **normal** = Chrome "Fast 4G", desktop. **slow** = Chrome "Slow 4G", desktop.
**mobile** = Fast 4G + 4x CPU slowdown + 390x844 at DPR 3. **Cold** = fresh isolated browser context.
**Warm** = second load in the same context.

## Time to playable

| Game | Profile | Cold before | Cold after | Saved | Warm before | Warm after | Saved |
|---|---|---:|---:|---:|---:|---:|---:|
| Higher or Lower | normal | 2819 (2636, 3002) | 1550 (1538, 1562) | **1269** | 1249 (1271, 1226) | 537 (513, 560) | **712** |
| Higher or Lower | slow | 8222 | 5347 | **2875** | 3150 | 996 | **2154** |
| Higher or Lower | mobile | 2537 | 2119 | 418 | 2518 | 2970 | -452 (see note) |
| Acca Crash | normal | 1795 | 1520 | **275** | 582 | 480 | 102 |
| Acca Crash | slow | 5861 | 4132 | **1729** | 1525 | 931 | **594** |
| Acca Crash | mobile | 1994 | 1820 | 174 | 2641 | 2287 | 354 |
| Last Man Standing | normal | 1243 | 786 | **457** | 424 | 375 | 49 |
| Last Man Standing | slow | 4058 | 2932 | **1126** | 1317 | 835 | **482** |
| Last Man Standing | mobile | 1210 | 1208 | 2 | 1195 | 886 | 309 |

Values in brackets are the individual runs; single values are single runs. Run-to-run variation on this
machine is large (the same before build measured 2157 to 3002 ms cold on normal), so differences under
about 300 ms on one run are within noise. Mobile emulation in particular is noisy: the 4x CPU slowdown
also stretches synchronous GPU calls, and warm mobile loads were sometimes slower than cold ones in both
builds. The HL mobile warm regression (-452) is one run each; an intermediate build measured 2461 warm on
the same profile. Mobile numbers need confirming on real devices before any conclusion.

## First visible loader

| Profile | Before | After |
|---|---:|---:|
| normal | 590 to 830 (React loader after the main JS ran) | 200 to 230 (inline HTML loader) |
| slow | 2240 to 2280 | 610 to 820 |

## Normal-profile timeline (cold, one representative run each)

| Metric | HL before | HL after | Acca before | Acca after | LMS before | LMS after |
|---|---:|---:|---:|---:|---:|---:|
| HTML response | 167-178 | 168-193 | 167-173 | 168-~200 | 169-176 | 168-199 |
| First visible loader | 544 | 199 | 574 | 209 | 677 | 217 |
| Backend bootstrap (mock init done) | ~690 | 704 | ~650 | 884 | ~810 | 757 |
| Main JS ready (boot running) | 537 (DCL) | 554 | 563 | 802 | 660 | 604 |
| Critical assets ready | ~1600 (atlas in worker) | 1437 | 966 (fonts) | 1265 (fonts) | 1075 | 669 (fonts) |
| Renderer ready | ~2113 | 1514 | ~1602 | 1469 | n/a | n/a |
| First render | 2157 | 1534 | 2224 | 1514 | 1104 | 784 |
| Playable | 2157 | 1534 | 2224 | 1515 | 1104 | 784 |

The "before" column here is the first, less contended baseline run (per-row timings were only recorded
in full for that run); the paired clean runs in the first table are the comparison of record.

## Transfer and requests (cold, normal)

| | HL before | HL after | Acca before | Acca after | LMS before | LMS after |
|---|---:|---:|---:|---:|---:|---:|
| JS transfer (gz) | 199 KB, 6 files | 206 KB, 13 files | 198 KB, 6 files | 205 KB, 13 files | 178 KB, 1 file | **104 KB, 2 files** |
| Critical asset transfer | 309 KB + 150 KB atlas in worker | 166 KB | about 200 KB | 157 KB | 162 KB fonts | 119 KB fonts |
| Deferred (after playable) | 0 | 52 KB background | 0 | 52 KB | 0 | 52 KB |
| Backend requests | 1 (mock) | 1 (mock) | 1 | 1 | 1 | 1 |
| Total requests | 27 (incl. favicon 404) | 34 | 18 | 25 | 9 | 10 |
| Failed requests | 1 (favicon) | 0 | 1 | 0 | 1 | 0 |
| Warm: files served from cache | 7 of 26 (rest revalidated, 304) | 33 of 34 | 7 of 17 | 23 of 25 | 2 of 8 | 9 of 10 |

HL and Acca have more JS files after because Pixi's chunks are now downloaded in parallel from the HTML
instead of in a second waterfall after the screen mounted. Total JS bytes are about the same.

## What was changed (largest measured effect first)

| Change | Where | Effect |
|---|---|---|
| Inline HTML loader | `index.html` | Loader visible about 350 ms (normal) and 1.5 s (slow) earlier |
| Everything critical starts from the HTML (`modulepreload` screen + Pixi chunks, font preloads) | `vite.config.ts` startup-hints | Removes the second waterfall (Pixi chunks used to start after the screen mounted: 450 ms normal, 1.5 s slow) |
| Screen code split from the boot (`loadScreen`), boot never imports Pixi | `GameBoot`, `defineGame`, game `index.ts` | LMS: 178 KB to 104 KB JS, no Pixi at all; Pixi games: boot runs earlier and starts session/assets sooner |
| Versioned, immutable public assets (`?v=`) | `assetUrl`, `vite.config.ts` | Warm loads: no 304 round trips (HL warm 1249 to 537 normal, 3150 to 996 slow) |
| Game atlas for HL badges (28 KB png) instead of the shared 150 KB, 1229x2032 atlas | `public/assets/higherlower/images` | Removes the longest critical download and a 10 MB GPU texture |
| WOFF2 fonts (lossless), hashed | `src/core/assets/fonts` | 162 KB to 119 KB for the four critical weights; immutable cache |
| SVGO on flags and icons | `public/assets/common` | Spain 55.6 to 19.8 KB gz, Portugal 13.4 to 5.4, Brazil 7.9 to 2.7 |
| WebGL warm-up during network idle | `core/pixi/warmup.ts` | Stage creation after data: about 500 ms (before, desktop) to 70 to 200 ms |
| Overlay until first frame | `GameBoot`, `PixiStage critical` | Loader no longer disappears onto a screen with no canvas (before: 490 ms gap on HL, 1070 ms on Acca) |
| Desktop background deferred, never loaded on phones | `styles.css` | 52 KB out of the critical path |
| Fonts non-fatal (3 s cap) | `GameBoot` | A font 404 used to stop the game ("Unable to start") |
| Relative asset URLs | `styles.css`, `AccaCrashScreen.tsx` | Builds work from any path (a subfolder deployment used to fail completely) |
| Empty favicon | `index.html` | One less request, no 404 |

## Targets

| Target | Result |
|---|---|
| Warm playable under 500 ms | **Met** for Last Man Standing (375) and Acca Crash (480) on normal. Higher or Lower 513 to 560: not met by about 15 to 60 ms (asset decode + renderer + first frame after data). Slow-profile warm: 835 to 996 (RTT-bound: the HTML and session cannot be cached). |
| Normal-network playable under 1000 ms | **Met** for Last Man Standing (786). Not met for Acca Crash (1520) or Higher or Lower (1550). |
| Slow-network playable under 2000 ms | **Not met** (2932 to 5347). |

Why the remaining targets were not reached:
- **Bytes over Slow 4G.** The first screen genuinely needs about 225 KB (LMS), 320 KB (Acca) or 370 KB
  (HL) of JS, fonts and art. Slow 4G delivers roughly 150 to 200 KB/s, so transfer alone is 1.2 to 2.5 s
  before any latency or processing.
- **HTTP/1.1 on the test server.** Browsers open 6 connections per host; HL's 14 small critical asset files
  queue behind JS and fonts (each finishes in turn, about 250 ms apart on Slow 4G). Chrome's own trace
  flags this ("ModernHTTP"). HTTP/2 or HTTP/3 hosting multiplexes them; expected to be the largest single
  production gain, but not measured here.
- **Fonts gate Pixi games.** Pixi draws text with whatever font is loaded at that moment, so the four
  weights (119 KB) must arrive first. Subsetting them is the next step (see Architecture).
- **Mock data in the LMS boot bundle** (155 KB raw) is about 60% of its boot JS; a real backend client
  will not ship it.
- **Renderer creation on weak CPUs.** WebGL context creation and texture upload are synchronous on the
  main thread; on 4x-throttled mobile emulation they take 0.3 to 1 s after the data is ready.

## Largest blocking operation and largest avoidable delay (after)

| Game | Largest blocking operation | Origin | Largest avoidable delay left |
|---|---|---|---|
| Higher or Lower | critical assets (normal 590 to 1437) | network (HTTP/1.1 queuing) + assets | HTTP/2 hosting; one sprite atlas for flags and icons |
| Acca Crash | fonts (slow: until 3792) | assets (fonts) | font subsetting |
| Last Man Standing | boot JS (slow: until 2721) | JavaScript (mock data) | real backend client instead of bundled mock data |

## Remaining production risks

- No real backend yet: session validation latency, payload size and database cost are unknown. Add
  `pbf:session` timing to production telemetry before tuning further.
- `?v=` immutability needs a host rule; without it, warm loads go back to one revalidation per asset file.
- Hosting over HTTP/1.1 would keep the asset queuing seen here.
- Each game is its own build at its own path, so shared files (fonts, React) are cached per game, not
  shared across games. Serving `common` from one shared path would make game switching faster.
- Mobile figures come from CPU emulation only; real low-end devices need a check.
- `pbf:playable` is also marked when the critical stage fails (the overlay is removed so the game's
  fallback is visible); telemetry should record stage failures separately.
