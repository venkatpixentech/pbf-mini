# Loading test results

Only tests that were actually run are listed as passed. Everything not run is listed at the end.

## Setup

- Browser: Chrome 158 driven through the Chrome DevTools protocol (separate browser instance), Windows 11,
  Intel Iris Xe (ANGLE D3D11). Only the measurement tab open during timed runs (an early series with other
  game tabs still animating was discarded: GPU contention inflated it by up to 3x).
- Server: a local static server written for the tests (scratch tooling, not part of the project): HTTP/1.1,
  gzip for text types, ETag, `immutable` for hashed file names and `?v=` URLs, `no-cache` for everything
  else, per-port fault injection (fail / hang a path). Builds served at the server root, and the nested-path
  test from a parent folder (`/higherlower/index.html`).
- Network/CPU: Chrome presets Fast 4G and Slow 4G; mobile = Fast 4G + 4x CPU + 390x844 DPR 3 touch.
- Measurement: a recorder inlined at the top of the HTML by the test server (MutationObserver, so timer
  throttling cannot skew it) for loader / screen / canvas / playable times; Resource Timing for transfers;
  Long Tasks API; the framework's own `pbf:*` marks (after builds).
- Cold = new isolated browser context. Cache-bypassing reloads were tried and rejected (5 files still came
  from cache).

## Timed runs (raw, ms to playable)

| Game | Profile | Before cold | Before warm | After cold | After warm |
|---|---|---|---|---|---|
| HL | normal | 2636, 3002 | 1271, 1226 | 1538, 1562 | 513, 560 |
| HL | slow | 8222 | 3150 | 5347 | 996 |
| HL | mobile | 2537 | 2518 | 2119 | 2970 |
| Acca | normal | 1795 | 582 | 1520 | 480 |
| Acca | slow | 5861 | 1525 | 4132 | 931 |
| Acca | mobile | 1994 | 2641 | 1820 | 2287 |
| LMS | normal | 1243 | 424 | 786 | 375 |
| LMS | slow | 4058 | 1317 | 2932 | 835 |
| LMS | mobile | 1210 | 1195 | 1208 | 886 |

Intermediate builds measured during the work (not the final build, kept for transparency): with
`fetchpriority=low` on renderer chunks, HL slow 5512, HL mobile 2388 / 2461, Acca normal 1200 / 420,
Acca slow 4025 / 980 (the stage waited 650 ms for the low-priority chunks, so the change was reverted).

## Functional tests (final build)

| Test | How | Result |
|---|---|---|
| Interactive, not just rendered: HL | after playable, click "Higher" | game state changed after 200 ms. Pass |
| Interactive: Acca Crash | click "Bet £1.00" | state changed after 100 ms. Pass |
| Interactive: Last Man Standing | click "Start for £5" | "Dealing..." after 100 ms. Pass |
| Nested deployment path | all three games from `/<id>/index.html` | all playable, no failed requests. Pass (before: fonts 404, "Unable to start") |
| Duplicate downloads | resource list per load, query strings ignored | none, all three games. Pass |
| Duplicate API requests | the mock runs in-process, so calls are not visible on the network; code review: production calls `init()` once, and `initOnce` now also removes the development StrictMode double call | Partly verified (not observable until a real backend exists) |
| Unnecessary chunks for DOM games | LMS network list and HTML hints | no Pixi file requested; HTML preloads only the screen chunk. Pass |
| Pixi instances | canvases after playable | HL 1, Acca 1, LMS 0. Pass |
| Console errors / warnings | DevTools console, normal loads | none on all three games. Pass |
| Failed asset (badges atlas returns 500) | fault injection | retried once (2 requests), "Unable to load" at 474 ms. Pass |
| Asset timeout (Spain flag never answers) | fault injection | progress held at 90%, "Unable to load" at 30.3 s (2 x 15 s). Pass (slow to give up by design; see risks) |
| Fonts fail (all WOFF2 return 500) | fault injection | warning per font, game playable at 731 ms with fallback font, interactive. Pass (before: the whole game failed) |
| Screen code fails | fault injection | "Unable to load" at 307 ms. Pass |
| Pixi renderer chunk fails | fault injection, fresh context | overlay removed at 516 ms, game UI shown without canvas, no hang. Pass |
| Backend error | `?mockInitError=MAINTENANCE` | "Under maintenance" screen, no canvas created. Pass |
| Repeated launch | 2 to 3 loads per context in every timed series | consistent, no errors, warm loads 33 of 34 files from cache (HL). Pass |
| Desktop and mobile viewports | timed series above | Pass (loads); layout unchanged |
| Visual check | screenshots before/after, HL at 390x844 | badge, flags, fonts render as before (bronze badge seen in after build; gold seen in before build). Pass |
| Dev server | `npm run dev -- higherlower` | playable, 1 canvas under StrictMode, no console messages. Pass |
| Load queue unit check | `loadQueue.check.ts` | concurrency, de-duplication, progress, retry, timeout, failure, abort. Pass |
| Typecheck, lint, all self-checks, production build | `npm run typecheck`, `lint`, `check`, `build` | all pass |

## Long tasks (over 100 ms) observed

| Build | Where | Duration |
|---|---|---|
| Before, desktop | Pixi Application init at canvas creation | 400 to 560 ms |
| Before, mobile 4x | main JS evaluation; Pixi init | 300 to 450 ms; 1080 to 1200 ms |
| After, desktop | warm-up probe during network idle | 100 to 310 ms (off the critical path) |
| After, desktop | stage creation | 120 to 250 ms |
| After, mobile 4x | stage creation / texture upload | 240 to 520 ms |

A trace of the before build showed the Pixi init task split into WebGL context creation (about 180 ms),
`getExtensions` (about 510 ms) and the support probe (about 480 ms) under tracing overhead. These are
synchronous GPU driver calls; the warm-up moves the probe and GPU start-up off the critical path, the
context creation itself stays.

## Not tested, or only partly

- Real backends: there are none yet; backend latency, payload size, database queries and real session
  timeouts were not measured. The 15 s session timeout path is covered by the `withTimeout` unit check,
  not by a browser test (the mock cannot hang).
- HTTP/2 / HTTP/3 hosting, a real CDN, real cache headers on the production host.
- Real mobile devices (only CPU emulation, which also stretches GPU calls).
- Memory: no heap or GPU memory measurement. Leaks were not measured beyond canvas counts.
- Statistical confidence: 1 to 2 runs per configuration; variance is high on this machine.
- Game switching across different games on one host (each game is a separate build and path).
- Silver and gold badges in the after build were not seen on screen (same crop method as bronze).
