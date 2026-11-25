# 10. Testing standards

What must pass before a change or a new game is done, what each check proves, how browser behaviour,
loading and layout are verified, and what is not tested yet.

## Required commands

Run from the project root. All four must pass.

| Command | What it proves |
|---|---|
| `npm run typecheck` | Strict TypeScript across `src` |
| `npm run lint` | ESLint (hooks rules, import order, React refresh) and Prettier; `npx eslint . --fix` formats |
| `npm run check` | `check:games` structure rules, then every self-check below |
| `npm run build` | `tsc` plus one standalone Vite build per game into `../pbf-game-builds/<id>` (`BUILD_DIR` overrides) |

## Self-checks (`npm run check`)

Plain TypeScript files run by Node with type stripping (`node --experimental-strip-types`), so they use
`.ts` import suffixes, plain class fields (no constructor parameter properties) and only type imports of
aliased `core/...` modules. Each is listed in the `check` script in `package.json`.

| File | Checks | Current output |
|---|---|---|
| `scripts/check-games.mjs` (`check:games`) | Game folder names are lowercase letters and digits; each game has `index.ts` default-exporting `defineGame(...)`; no game imports another; each game's `*.check.ts` is in the `check` script | `ok (accacrash, higherlower, lastmanstanding)` |
| `src/core/services/services.check.ts` | Money rounding and comparison, `RoundEngine` phases | `ok` |
| `src/core/boot/loadQueue.check.ts` | Bounded concurrency, de-duplication, progress, retry, timeout, failure, abort | `ok` |
| `src/core/pixi/viewConfig.check.ts` | View config validators | `ok` |
| `src/games/higherlower/api/mockServer.check.ts` | Stakes, settle, cash out, errors, simulated RTP | single-pick RTP 0.9518 over 20000 rounds |
| `src/games/accacrash/api/mockServer.check.ts` | Bets, cash out, crash distribution, boosts | P(M>=2) 0.480, simulated RTP 0.9419, 1029/2000 runs boosted |
| `src/games/lastmanstanding/api/mockServer.check.ts` | Stake, fixtures, picks, cash out, loss, ladder | round-1 return 0.9456 over 6000 games |
| `src/games/higherlower/scenes/config.check.ts`, `src/games/accacrash/scenes/config.check.ts` | The game's view configs validate | `ok` |

Mock servers take `latencyMs: 0` and a seeded `random` for these checks. Fixtures are synthetic only (no real
player names or user data). The simulated RTPs check the mock maths; the real maths belong to the backend.

## Browser verification (required for every change a player can see)

1. `npm run dev -- <id>` (port 3100; stop other dev servers first), or serve a build from
   `../pbf-game-builds/<id>`.
2. Walk the whole journey: boot, a full round or flow, cash-out or result paths, every screen, and an error
   path (`?mockInitError=MAINTENANCE`).
3. Console: no errors or warnings. No broken image
   (`[...document.images].filter(i => i.complete && !i.naturalWidth)` is empty).
4. Check the layout at the sizes below and that controls work (a click changes game state).

## Layout verification (doc 06)

Sizes: 320x568, 360x800, 390x844, 430x932, landscape 844x390 and 667x375, desktop 1280x800, embedded
360x420 and 300x480, and an operator element with `--pbf-host-height: 420px`. For each: the lowest edge of the
essential controls (bet buttons, stake chips, canvas, balance) is inside the viewport, ideally within 50% of
its height; no horizontal overflow; no console errors. Also check in-round states (a result, a running round,
each screen of a multi-screen game) and that a resize keeps the same canvas element.

## Loading verification (doc 05)

Measure time to playable with a real browser and throttling, comparing before and after under identical
conditions:
- Chrome via the DevTools protocol, network presets Fast 4G and Slow 4G, mobile = Fast 4G + 4x CPU at
  390x844 DPR 3.
- Cold = a fresh isolated browser context (cache-bypassing reloads still served files from cache: rejected).
  Warm = a second load in the same context.
- Only the measurement tab open (an early series with animated game tabs open was inflated up to 3x by GPU
  contention and was discarded). Never measure in a hidden or unfocused pane: timers are throttled to 1 s.
- Read the `pbf:*` performance marks and Resource Timing; record a playable time per run, at least two runs
  per configuration, and state the variance.
- Failure paths with fault injection: asset 500, asset that never answers, fonts 500, screen chunk 500,
  renderer chunk 500, `?mockInitError=MAINTENANCE`.

The full method and every recorded run are in
[archive/loading-audit/LOADING_TEST_RESULTS.md](archive/loading-audit/LOADING_TEST_RESULTS.md).

## Criteria not yet automated (from the original validation plan)

| ID | Criterion |
|---|---|
| V1 | 50 Pixi mount/unmount cycles leave 0 live WebGL contexts (passed once in the spike; not automated) |
| V2 | Memory returns to within 10% of the start after repeated cycles (never measured) |
| V4 | 20 navigations on iOS Safari without losing the context (never run) |
| SC6 | 60 fps average and under 1% of frames over 50 ms on a low-end Android (never run) |
| SV6 | Money compares numerically (`"10.5"` vs `"2"`) |
| SV7 | On a cash-out race the server's decision wins |
| OP1 to OP6 | Operator integration tests; required before any operator integration change |

## Gaps

- No unit, component or end-to-end test runner (Vitest, Testing Library, Playwright) is installed; adding
  them is an open decision.
- The browser, layout and loading measurements above were run with scripts outside this repository; they
  are not reproducible from `npm` scripts yet.
- No real-device testing (iOS Safari, Android); no memory or GPU measurements.
- Never browser-tested: Higher or Lower cash-out at the lock moment and long streaks.
