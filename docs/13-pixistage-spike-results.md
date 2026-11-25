# 13. PixiStage spike results

Date: 2026-11-23. Scope: doc 12 section 9 (approved). Project: `C:\Users\venka\PBF\pbf-game-framework`. The PBF project was not touched.

## What was built
| File | Purpose |
|---|---|
| `package.json`, `tsconfig.json` (strict), `vite.config.ts`, `index.html` | React 18.3.1, TypeScript 5, Vite 5, pixi.js 8.9.2 (same versions as PBF) |
| `eslint.config.mjs`, `.prettierrc` | Copied from PBF (generated-code override removed; reference/tools/baseline ignored) |
| `src/framework/pixi/scene.ts` | `PixiScene<P,E>`, `SceneContext` (`emit`, `track`), `SceneFactory`, `StageAsset` |
| `src/framework/pixi/stageAssets.ts` | Load/unload per stage with reference counts per alias |
| `src/framework/pixi/PixiStage.tsx` | One Pixi Application per mount; resize via `resizeTo`; pause (prop + tab hidden); context loss via `onError`; teardown exactly once on every path (normal unmount, unmount during async init, init failure) |
| `src/games/higher-lower/scenes/CardRevealScene.ts` | Spike scene: current card face up, next face down, flip on `next`, emits `REVEAL_DONE`; badge art from PBF's `progressHub` atlas |
| `public/assets/common/images/@1x/progressHub.{json,webp}` | Copied from the PBF reference (shared asset pack) |
| `src/App.tsx`, `src/main.tsx`, `src/styles.css` | Demo page (StrictMode on to exercise double mount) |
| `src/spike/lifecycleCheck.ts` | Self-check for V1, V6, V7 (spike only) |

## Checks
| Check | Result | Evidence |
|---|---|---|
| `tsc --noEmit` (strict) | Pass | clean |
| ESLint (PBF rules) | Pass | 0 errors, 0 warnings after fixing one finding (ref written during render, moved into an effect) |
| `vite build` | Pass | 3.9 s; main chunk 415 kB (132 kB gzip), Pixi renderers split into lazy chunks |
| Render under StrictMode | Pass | card renders with the PBF silver badge; no console errors |
| Typed event | Pass | `REVEAL_DONE ovr=78 tier=silver` received by React after the flip |
| **V1** contexts released (50 mount/unmount) | **Pass** | 50 mounts, 0 WebGL contexts alive (Pixi's renderer calls `WEBGL_lose_context` on destroy); 0 canvases left |
| **V6** no global listener leaks | **Pass (logic verified)** | First run flagged `window:resize=-200`: Pixi's ResizePlugin removes its listener twice per destroy (no-op), not a leak; the check now flags only extra adds. A deliberate leak probe (untracked `keydown` listener) was caught as `window:keydown=+50` (FAIL), then removed |
| **V7** stage assets | **Pass** | present while mounted; released after unmount; kept while a second stage shares it; released after both unmount |

**Final clean re-run (pane visible, 2026-11-23): 7 of 7 PASS in 6 s.** V1 contexts released (50 mounts, 0 alive), no canvas left; V6 no extra adds on window or document (only Pixi's harmless redundant `resize` removes); V7 all four asset checks.

## Not verified
- **V2** memory, **V4** iOS Safari, **V5** forced context loss, **V8** cold mount time: not run (need DevTools memory, a real iOS device, and a performance trace).
- No automated test runner (Vitest/Playwright still awaiting approval, Q4); the self-check runs in the page.

## Findings for the framework
1. Per-mount Applications are viable: contexts are released deterministically, so a shared Application is not needed (decision stands, doc 03 A2).
2. React StrictMode double-mount is handled by the `cancelled`/`done` pattern in `PixiStage`.
3. Pixi spritesheet frames register globally by frame name; two different atlases with the same frame names would collide. Asset naming must stay unique across packs (add to `validate-assets`).
4. Hidden pages pause the Pixi ticker (rAF); scenes must not assume time passes while hidden. `PixiStage` already stops the ticker on `visibilitychange`.
