# Loading dependency map

Every operation between "game opened" and "player can act", per game, before and after the loading work.
All times are measured, in milliseconds from navigation start, on the reference setup in
`LOADING_TEST_RESULTS.md` (Chrome 158, Fast 4G, desktop, cold cache, local static server over HTTP/1.1 with gzip).
"Playable" means: game screen mounted, loading overlay gone, first frame drawn (Pixi games: the critical
canvas), so a tap reaches the game. Performance marks `pbf:<stage>` record the after timeline.

## Backend part of the chain

There is no real backend yet. Every game talks to a mock (`src/games/<id>/api/mockServer.ts`) through
`core/services/mockTransport` with a fixed simulated latency.

| Game | Startup calls | Required before play | Simulated latency | Payload |
|---|---|---|---|---|
| Higher or Lower | `init()` (session, balance, stakes, current card, round state) | yes | 150 ms | small JSON object |
| Acca Crash | `init()` (session, balance, stakes, round state) | yes | 80 ms | small JSON object |
| Last Man Standing | `init()` (session, balance, stakes, leagues) | yes | 150 ms | small JSON object |

Findings:
- One call per game, no sequential chains and no history calls at startup, so there is nothing to merge
  into a "bootstrap" endpoint. A consolidated endpoint was not added (no measured benefit).
- Session validation, token handling and authorisation stay server-side (doc 19). The token is passed
  only to `createApi` and never logged.
- In development, React StrictMode ran `init()` twice per load. `GameBoot` now de-duplicates it per api
  instance (`initOnce`); production builds always made one call.
- Real endpoint latency, payload size and database cost cannot be measured until the real backends
  exist. See "Remaining production risks" in `LOADING_PERFORMANCE_BEFORE_AFTER.md`.

## Higher or Lower

### Before

| Operation | Start | End | Blocks play | Notes |
|---|---:|---:|---|---|
| HTML | 167 | 178 | yes | |
| Blank page (nothing painted) | 178 | 544 | yes | no loader in HTML |
| Main JS (138 KB gz, incl. Pixi core, React, game) | 186 | 511 | yes | one file, must download and run before anything else starts |
| React boot loader visible | 544 | | | |
| Fonts (4 x TTF/OTF, 162 KB gz) | 543 | 922 | yes | started only after main JS ran |
| Session init (mock) | ~540 | ~690 | yes | |
| Flags, icons, atlas JSON | 587 | 1330 | yes | Spain flag 54 KB gz is the longest |
| progressHub atlas image (150 KB webp, 1229x2032) | ~940 | ~1600 | yes | fetched by Pixi's worker after the JSON, invisible in resource timing |
| Game screen mounted | 1668 | | | loader removed here, canvas still missing |
| Pixi renderer chunks (WebGL, shared systems, environment) | 1668 | 2113 | yes | discovered only when the stage starts: a second waterfall |
| Pixi Application init (WebGL probe + context + extensions) | ~2113 | 2157 | yes | 400 to 560 ms main-thread task on desktop |
| Canvas present (playable) | 2157 | | | 2636 and 3002 in the two clean paired runs |

### After

| Operation | Start | End | Blocks play | Parallel | Cacheable | Notes |
|---|---:|---:|---|---|---|---|
| HTML | 168 | 193 | yes | | no-cache | |
| Inline loader painted | 199 | | | | | from the HTML itself |
| Boot JS + React (51 + 35 KB gz) | 203 | 540 | yes | yes | immutable | |
| Screen code, Pixi preload/warm-up modules, Pixi chunks (modulepreload) | 203 | 860 | yes | yes | immutable | all start with the HTML |
| Fonts (4 x WOFF2, 119 KB) | 206 | 1004 | yes | yes | immutable | preloaded from the HTML |
| `pbf:bootstrap` | 554 | | | | | boot code running |
| Session init (mock) | 554 | 704 | yes | yes | no | |
| WebGL warm-up (`pbf:renderer-warm`) | ~600 | 721 | no | yes | | moves the GPU probe off the critical path |
| Critical assets: badges atlas (28 KB png), 9 flags, 3 icons | ~590 | 1437 | yes | yes (6 at a time) | immutable (`?v=`) | queued behind HTTP/1.1's 6 connections |
| `pbf:critical` | 1437 | | | | | everything the first screen needs |
| Screen mounted under overlay, stage created (`pbf:renderer`) | 1437 | 1514 | yes | | | |
| Scene built, first frame drawn (`pbf:first-render`) | 1514 | 1534 | yes | | | |
| Overlay removed (`pbf:playable`) | 1534 | | | | | |
| Desktop background (52 KB) | after playable | | no | | immutable | deferred |

Largest remaining blocking operation: critical assets (590 to 1437). On mobile CPU: asset decoding and
GPU texture upload plus renderer creation.

## Acca Crash

### Before

| Operation | Start | End | Blocks play | Notes |
|---|---:|---:|---|---|
| HTML | 167 | 173 | yes | |
| Main JS (138 KB gz) | 182 | 506 | yes | |
| React loader visible | 574 | | | |
| Fonts (4 x TTF/OTF) | 576 | 966 | yes | |
| Session init (mock, 80 ms) | ~570 | ~650 | yes | |
| Screen mounted | 1157 | | | |
| Pixi renderer chunks | 1154 | 1602 | yes | second waterfall |
| Pixi Application init | ~1602 | ~2200 | yes | 562 ms main-thread task |
| Canvas present (playable) | 2224 | | | 1795 in the clean paired run |

### After

| Operation | Start | End | Blocks play | Notes |
|---|---:|---:|---|---|
| HTML, inline loader | 168 | ~200 | | |
| Boot JS, screen code, Pixi chunks, fonts (all from the HTML) | ~205 | ~1110 | yes | parallel |
| `pbf:bootstrap` | 802 | | | |
| Session init (mock) | 802 | 884 | yes | |
| Screen code ready (`pbf:code`) | 902 | | | |
| WebGL warm-up | | 952 | no | |
| Fonts ready | | 1265 | yes | the gate for this game (no textures) |
| Stage created, scene built, first frame | 1265 | 1514 | yes | |
| Playable | 1515 | | | |

Largest remaining blocking operation: fonts (119 KB) on slow links; renderer creation on mobile CPU.

## Last Man Standing (no Pixi)

### Before

| Operation | Start | End | Blocks play | Notes |
|---|---:|---:|---|---|
| HTML | 169 | 176 | yes | |
| Main JS (178 KB gz, included Pixi core it never uses, plus 155 KB raw mock data) | 190 | 578 | yes | |
| React loader visible | 677 | | | |
| Fonts + desktop background | 679 | 1075 | yes (fonts) | background competed for bandwidth |
| Session init (mock, 150 ms) | ~660 | ~810 | yes | |
| Screen (playable) | 1104 | | | 1243 in the clean paired run |

### After

| Operation | Start | End | Blocks play | Notes |
|---|---:|---:|---|---|
| HTML, inline loader | 168 | 217 | | |
| Boot JS (96 KB gz, no Pixi) + screen code (8 KB) | 211 | 590 | yes | parallel; Pixi chunks exist in the build but are never requested |
| Fonts (WOFF2, preloaded) | 212 | 669 | yes | |
| `pbf:bootstrap` | 604 | | | |
| Session init (mock) | 604 | 757 | yes | |
| Playable (screen painted) | 784 | | | |
| Desktop background | 784 | 1012 | no | deferred |

Largest remaining blocking operation: the boot JS, most of which is mock data (`api/mockData.ts`,
155 KB raw) that a real backend client will not ship.

## Can it run in parallel, be cached, be deferred?

| Operation | Parallel | Cached | Deferred | How |
|---|---|---|---|---|
| Boot JS, screen code | yes | immutable (hashed) | no | `modulepreload` from the HTML |
| Pixi chunks (Pixi games only) | yes | immutable | no | `modulepreload` from the HTML |
| Fonts (4 weights) | yes | immutable | no (Demi 600 is: loads on first use) | `preload as=font` |
| Session init | yes | never (per-player) | no | started first thing in `GameBoot` |
| Critical Pixi assets | yes, 6 at a time | immutable via `?v=` | no | `core/pixi/preload` + `runQueue` |
| WebGL probe | yes (main thread idle time) | per page | n/a | `core/pixi/warmup` |
| Pixi stage + scene + first frame | no (needs data, assets, fonts) | n/a | no | under the overlay |
| Desktop background | n/a | immutable | yes, until playable | `.pbf-decorated` class |
| Shared progressHub atlas | n/a | n/a | removed from startup | game atlas instead |
