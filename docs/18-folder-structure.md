# 18. Folder structure reference

What every folder and file in `pbf-game-framework` is for. Kept current with the code (doc 04 is the original plan, this is the as-built map). `node_modules` is generated and not expanded. Builds are written outside the project to `../pbf-game-builds/<id>` (set `BUILD_DIR` to change), so there is no `dist/` here.

## Top level

```
pbf-game-framework/
  src/             all application code (core + games)
  public/          static assets served as-is (art, fonts)
  scripts/         dev, build, check and scaffold commands
  docs/            architecture, plan, status, how-to
  node_modules/    dependencies (generated, git-ignored)
```

## Root files

| File | Use |
|---|---|
| `package.json` | npm scripts (`dev`, `build`, `typecheck`, `lint`, `format`, `check`, `check:games`, `new-game`) and dependencies. The `check` script lists every mock backend self-check. |
| `package-lock.json` | Locked dependency versions. |
| `vite.config.ts` | Vite config. Reads `GAME_ID` and resolves the `@game` alias to `src/games/<id>/index.ts`, so each server/build contains one game. Also sets the `core/` import alias and port 3100. |
| `tsconfig.json` | Strict TypeScript config for `src`. |
| `eslint.config.mjs` | ESLint rules: hooks, import order, Prettier. |
| `.prettierrc` | Formatting rules. |
| `.gitignore` | Ignores `node_modules`, `dist`. |
| `index.html` | Single HTML entry. Mounts `src/main.tsx`. |
| `README.md` | Quick commands and a short folder table. |

## `src/`

| File | Use |
|---|---|
| `main.tsx` | App entry. Imports `@game`, wraps it in `GameBoot` and `AppShell`, renders with React. |
| `styles.css` | Global styles: PBF design tokens (CSS variables), `pbf-*` classes (`pbf-btn`, `pbf-card`, `pbf-pill`, `pbf-caption`), desktop frame (`.app-shell`, `.app-frame`), rotate overlay. |
| `game.d.ts` | Type declaration for the `@game` alias. |

### `src/core/` (shared by every game)

| File | Use |
|---|---|
| `boot/GameBoot.tsx` | Boot sequence: reads launch params, preloads fonts/assets and calls `init` in parallel, shows the preloader and blocking init-error screens (maintenance, session expired/invalid), then renders the game's screen. |
| `boot/launchParams.ts` | Reads operator launch params (token, currency, etc.) from the URL hash or query string. The token goes to the backend only, never logged or stored. |
| `game/defineGame.ts` | `defineGame({...})` contract every game exports, plus the `InitResponse` core subset (`balance`, `currency`, `stakes`). |
| `hooks/useApiMessage.ts` | Player-facing message state and `fail()` that maps a backend error code to copy. |
| `hooks/useRoundEngine.ts` | React hook around `RoundEngine`: starts on mount, stops on unmount, exposes phase and countdown. |
| `pixi/PixiStage.tsx` | React component that owns a Pixi `Application` and mounts a typed scene; handles lifecycle and teardown. |
| `pixi/scene.ts` | `PixiScene` contract: scene context, props in, `emit` events out, `ctx.track()` for tickers/listeners. Scenes never import React or services. |
| `pixi/stageAssets.ts` | Ref-counted asset loading so a texture shared by two stages survives one unmounting. |
| `pixi/theme.ts` | Shared canvas theme: PBF colours, fonts and card tier palette as Pixi values. Scenes and configs reference these names, they never hard-code a colour. |
| `pixi/viewConfig.ts` | Typed config shapes for a canvas view: canvas portion (`heightPct`, `minHeight`, `maxHeight`), text style, element types (text, sprite, shape, group) and `canvasHeight()`. |
| `pixi/buildView.ts` | `buildElements(config, data)` turns a config element list into Pixi objects, binding data (`bind`, `{token}` aliases). Each object is labelled with its config `id`. |
| `pixi/CanvasFrame.tsx` | The canvas area of a screen. Takes its height from the view config, holds `<PixiStage>` and any React overlays. |
| `pixi/usePixiEffect.tsx` | Hook for small one-off Pixi effects (confetti, glow) without a full scene. |
| `services/RoundEngine.ts` | Timed round phase machine. Owns phases and timers only; never calls a backend or decides outcomes. |
| `services/apiError.ts` | `ApiError` class and `SessionErrorCode` shared by all game backends. |
| `services/money.ts` | `roundMoney`, compare helpers, `formatMoney`. All money maths goes through here. |
| `services/mockTransport.ts` | MOCK only: simulated latency replies (`reply`, `fail`) and `mockInitError()` for `?mockInitError=...`. |
| `services/services.check.ts` | Self-check for money helpers and RoundEngine. |
| `ui/AppShell.tsx` | Shared frame: centred phone-width column on desktop, full width on phones, rotate-to-portrait overlay. No product logo. |
| `ui/GameHeader.tsx` | PBF game header: eyebrow, title, balance pill. |
| `ui/StakeChips.tsx` | Stake selector chips from the backend's `stakes`. |

### `src/games/<id>/` (one folder per game, never imports another game)

Every game has: `index.ts` (default `defineGame`), `<Id>Screen.tsx` (root screen), `<id>.css`, and `api/` with `types.ts` (contract), `mockServer.ts` (MOCK backend), `mockData.ts` (synthetic data, optional), `mockServer.check.ts` (self-check).

**`higherlower/`** single screen, one Pixi scene

| File | Use |
|---|---|
| `HigherLowerScreen.tsx` | Game UI: card, markets, stake, streak, cash-out. |
| `higherLower.css` | Game styles. |
| `scenes/cardReveal.config.ts` | View config: canvas portion, card face, back and VS elements, layout, assets and every reveal timing. Edit here to change the canvas. |
| `scenes/CardRevealScene.ts` | View: builds the cards from the config and runs the flip reveal. |
| `confetti.config.ts` | Config for the confetti: count, colours, piece size, origin, speed, gravity, fade. |
| `WinConfetti.tsx` | Confetti burst on a win (uses `usePixiEffect`), driven by the config. |
| `ftue.ts` | Splash and first-run tutorial flags (client-side hint only). |
| `feed.ts` | Cosmetic "other players" feed. Decorative, never touches balance or outcomes. Drives the Live feed panel. |
| `api/*` | Contract, MOCK server (RTP 0.96, streak bonus), synthetic players, self-check. |

**`accacrash/`** single screen, curve scene

| File | Use |
|---|---|
| `AccaCrashScreen.tsx` | Game UI: bet, live multiplier, cash-out, community panel. |
| `accaCrash.css` | Game styles. |
| `scenes/crashCurve.config.ts` | View config: canvas portion, plot padding and grid levels, colours by state, label texts and label elements, pulse. Edit here to change the canvas. |
| `scenes/CrashCurveScene.ts` | View: draws the live crash curve from server samples using the config. |
| `crowd.ts` | Cosmetic simulated crowd (ALL BETS / PREVIOUS / TOP). Decorative only. |
| `api/*` | Contract, MOCK server (crash point, goal boosts, cash-outs), synthetic clubs/scorers, self-check. |

**`lastmanstanding/`** multi-view React game, no Pixi scene (built from the Last Man Standing prototype)

| File | Use |
|---|---|
| `LastManStandingScreen.tsx` | Root: holds balance, the running game and the current view (setup, play, match, banked). |
| `lastmanstanding.css` | Game styles (`lms-*` classes on PBF tokens). |
| `lib.ts` | Display helpers: team tier, planner colours, fixture lookup, prize for a round, cosmetic ball path. |
| `ui.tsx` | Shared pieces: OVR badge, win/draw/loss bar and its key. |
| `screens/Setup.tsx` | League, difficulty and stake choice, start button, top prize. |
| `screens/Play.tsx` | Status, prize ladder, this game week (pick one team), fixture planner, your 20 teams, history. |
| `screens/Match.tsx` | Plays back the server's result (score, events, pitch view), the verdict and cash out, and the cashed out screen. |
| `screens/Guide.tsx` | "How results and prizes work" explainer, with the exact ladder maths of the running game. |
| `api/types.ts` | Backend contract: start a game, pick a team, cash out. |
| `api/mockServer.ts` | MOCK backend: fixture list, match results, prize ladder, wallet. |
| `api/mockData.ts` | MOCK data from the prototype: 3 leagues x 20 club ratings, 100 fixture lists and ladders per difficulty. |
| `api/mockServer.check.ts` | Self-check: stake, fixtures, picks, cash out, loss, and a round-1 return of about 0.95. |

## `public/assets/`

| Folder | Use |
|---|---|
| `common/fonts` | PBF fonts (Degular, Avenir Next). Shared by every game. |
| `common/icon` | Shared SVG icons (attack, creativity, defence). |
| `common/images` | Shared images: `@1x`, `countryIcons`, `desktop` (frame background). |

Each game has its own `public/assets/<id>/` (`higherlower`, `accacrash` and `lastmanstanding` are empty for now, they only use `common`). `npm run new-game` creates it. Shared art goes in `common`. In dev the whole `public/` is served; a build copies only `common` plus that game's own folder, so a game never ships another game's art.

## `scripts/`

| File | Use |
|---|---|
| `dev.mjs` | `npm run dev -- <id>`: starts Vite for one game on port 3100. |
| `build.mjs` | `npm run build [-- <id>...]`: builds each game on its own into `../pbf-game-builds/<id>`, outside the project. |
| `check-games.mjs` | `npm run check:games`: enforces game structure (index.ts with `defineGame`, no cross-game imports, self-check listed in `check`). |
| `new-game.mjs` | `npm run new-game -- <id> "<Title>"`: scaffolds a passing placeholder game and registers its self-check in `package.json`. |

## `docs/`

| File | Use |
|---|---|
| `01-existing-architecture-audit.md` | Audit of the current PBF project. |
| `02-current-game-comparison.md` | Comparison of the existing games. |
| `03-upgraded-framework-architecture.md` | Target architecture. |
| `04-complete-folder-file-structure.md` | Original planned structure (this doc is the as-built version). |
| `05-core-file-implementation-specification.md` | Spec for each core file. |
| `06-module-connection-and-dependency-map.md` | How modules depend on each other. |
| `07-backend-integration-and-round-lifecycle.md` | Backend contract and round lifecycle. |
| `08-validation-and-testing-checklist.md` | Validation checklist. |
| `09-one-sweep-development-roadmap.md` | Roadmap. |
| `10-risk-security-and-open-questions.md` | Risks and open backend questions (Q1 etc.). |
| `11-p0-status-and-decisions.md` | P0 status and decisions. |
| `12-baseline-report-and-migration-plan.md` | Baseline report and migration plan. |
| `13-pixistage-spike-results.md` | PixiStage spike results. |
| `14-higher-or-lower-mock-build.md` | Higher or Lower build notes. |
| `15-accacrash-and-pbf-theme.md` | Acca Crash and the PBF theme. |
| `16-creating-a-new-game.md` | How to add a game and the checks that must pass. |
| `17-framework-status.md` | Current status. Start here. |
| `18-folder-structure.md` | This file. |
| `19-backend-responses.md` | Request and response shapes, error codes and open points for each game's backend. |


## Removed from the project

These were deleted as not needed to run, build or check a game:

| Removed | Why |
|---|---|
| `legacy/` | Copy of the original PBF project; the art needed is already in `public/assets`. |
| `reference/` | Read-only PBF export and HTML prototypes. |
| `baseline/`, `tools/` | PBF baseline captures and the scripts that made them. |
| `dist/` | Builds now go outside the project (`../pbf-game-builds/<id>`). |
| `src/spike/` | Dev-only PixiStage test page. |

Docs `01` to `15` are kept as design history and may still mention these folders.
