# 16. Creating a new game

How to add a game to this framework, and which checks must be green before it is done. Reference games: `higherlower` (single screen, one Pixi scene), `accacrash` (single screen, curve scene), `lastmanstanding` (multi-view React game, no Pixi scene, server-owned fixture list and prize ladder).

## Rules

1. **React owns everything**: routing, screens, UI, state and API calls. Pixi is only for gameplay animation or heavy effects (card flip, crash curve, confetti). UI motion is CSS or GSAP.
2. **A game is one folder**: `src/games/<id>`. The id is all lowercase, letters and digits only (`accacrash`), with no capitals, hyphens, spaces or other special characters. It never imports another game. Shared code goes in `src/core`.
3. **One game per dev server and per build.** There is no tab or game switcher. `GAME_ID` picks the game.
4. **The backend decides outcomes.** The client never computes results, balance or prices. Until the real contract exists (doc 10, Q1) the game uses a mock backend, clearly marked `MOCK`.
5. **Use PBF's real assets and design tokens.** Copy art from the PBF project (read only) into `public/assets/<id>/`, never edit the PBF project.
6. **No secrets in code or fixtures.** Tokens and credentials never go in the repo.

## Quick start

```bash
npm run new-game penaltyshootout "Penalty Shootout"
npm run dev penaltyshootout
npm run check
```

`new-game` creates the whole folder below with a working placeholder game (mock backend, self-check, screen, styles), registers the self-check in `package.json` and formats the files. The placeholder passes every check and builds as is, so you start green and replace the placeholder `play()` rules and screen with the real game. It refuses an id that already exists or is not lowercase letters and digits only.

## Folder layout

```
src/games/<id>/
  index.ts                  the only file the core reads: export default defineGame({...})
  <Id>Screen.tsx            root screen (React); gets { api, init, launch }
  <id>.css                  game styles (use the pbf-* classes and CSS tokens from src/styles.css)
  api/
    types.ts                the backend contract: Api interface, InitResponse, error codes
    mockServer.ts           MOCK backend that implements the Api
    mockData.ts             synthetic data (never real player names or user data)
    mockServer.check.ts     self-check of the mock backend rules (run by `npm run check`)
  scenes/                   optional: Pixi views, one <name>.config.ts (all layout, styling, timings, assets, canvas portion) plus one <Name>Scene.ts view per canvas
  screens/                  optional: one file per screen group, for multi-screen games
public/assets/<id>/         the game's own art (shared art lives in public/assets/common; a build ships only common + this folder)
```

## Steps

### 1. Define the contract first (`api/types.ts`)

`InitResponse` must extend the core subset `{ balance, currency, stakes }`. Add the game's own fields, an `Api` interface with `init()` plus one method per backend call, and a typed error code union that reuses `SessionErrorCode` and `ApiError` from `core/services/apiError`.

### 2. Build the mock backend (`api/mockServer.ts`)

Use `mockTransport(latencyMs)` for `reply` and `fail`, and `roundMoney` from `core/services/money` for every money calculation. Accept `{ latencyMs, random, currency, initError }` options so tests can seed it. The server owns the wallet and every outcome. Support `?mockInitError=MAINTENANCE|SESSION_EXPIRED|SESSION_INVALID` through `mockInitError()` in `index.ts`.

### 3. Write the self-check (`api/mockServer.check.ts`)

Run the mock with `latencyMs: 0` and a seeded random. Assert the rules that matter: stakes are taken, wins pay out, losses do not, invalid input is rejected with the right code, and a simulated RTP is in range for betting games. Node runs it with type stripping, so use plain fields (no constructor parameter properties) and `.ts` import suffixes. See `src/games/higherlower/api/mockServer.check.ts`.

### 4. Register the game (`index.ts`)

```ts
import { defineGame } from 'core/game/defineGame';
import { mockInitError } from 'core/services/mockTransport';

import { createMockServer } from './api/mockServer';
import { MyGameScreen } from './MyGameScreen';

export default defineGame({
  id: 'my-game',
  title: 'My Game',
  preload: [], // Pixi assets needed by the first screen
  // MOCK: replace with the real backend client once the contract exists (doc 10 Q1).
  createApi: (launch) => createMockServer({ currency: launch.currency ?? 'GBP', initError: mockInitError() }),
  Screen: MyGameScreen,
});
```

The core handles launch params, the preloader (fonts, assets and init in parallel), blocking init-error screens, and the PBF desktop frame. The game only renders its screen.

### 5. Build the screens

- Start from `GameHeader`, `StakeChips`, `useRoundEngine` (timed phases), `useApiMessage` (error code to copy) from `src/core`.
- Reuse the `pbf-*` classes (`pbf-btn`, `pbf-card`, `pbf-pill`, `pbf-caption`) and tokens before writing new CSS.
- Multi-screen games keep a stack of screens in React state. Do not add a router.
- Money display always goes through `formatMoney`.

### 6. Add Pixi only where it earns its place

| Need | Use |
|---|---|
| Buttons, panels, transitions, counters, stamps | CSS or GSAP |
| Small one-off effect (confetti, glow) | `usePixiEffect` from `core/pixi/usePixiEffect`, with a config file for its numbers |
| Reusable or eventful gameplay surface | a typed `PixiScene` class plus `<PixiStage>` |

### Canvas views and configs

Everything in a canvas follows a view and a config:

- **Config** (`scenes/<name>.config.ts`): the canvas portion (`canvas: { heightPct, minHeight, maxHeight }`), the element list (positions, sizes, fonts and colours by theme name), timings and assets. This is the file you edit to change the canvas.
- **View** (`scenes/<Name>Scene.ts`): builds the elements with `buildElements(config, data)` from `core/pixi/buildView` and animates them. No literal sizes, colours, fonts or timings in the view.
- **Canvas portion**: wrap `<PixiStage>` in `<CanvasFrame config={config.canvas}>`; its height comes from the config, not from CSS.
- **Theme**: colours and fonts come from `core/pixi/theme` (`COLORS`, `FONTS`, `TIER_COLORS`).
- Live data drawings (a curve, a chart) stay in the view, but their padding, line widths, colours and labels come from the config.

Rules for scenes: no React, stores or services inside a scene; talk to React only through props in and `emit` events out; register tickers and listeners with `ctx.track(...)`; list assets in the game's `preload` or the stage's `assets` so they are ref counted and released.

### 7. Register the self-check

Add the check file to the `check` script in `package.json`:

```
node --experimental-strip-types --no-warnings src/games/<id>/api/mockServer.check.ts
```

`npm run check:games` fails if a game has a self-check that `check` does not run.

## Checks that must be green

Run from the project root:

| Command | What it proves |
|---|---|
| `npm run typecheck` | strict TypeScript, no `any` leaks in the contract |
| `npm run lint` | ESLint, hooks rules, import order, Prettier (use `npx eslint . --fix` for formatting) |
| `npm run check` | `check:games` structure rules plus every mock backend self-check |
| `npm run build` | `tsc` plus a standalone Vite build of every game into `../pbf-game-builds/<id>`, outside the project (`BUILD_DIR` overrides) |

`npm run check:games` enforces:

0. The folder name is lowercase letters and digits only.
1. The game has an `index.ts` that default-exports `defineGame(...)`.
2. No file imports another game's folder.
3. The game has a `*.check.ts` and it is listed in the `check` script.

## Browser verification (manual, required)

1. `npm run dev -- <id>` (one dev server at a time; stop the previous one first).
2. Open `http://localhost:3100` in a window at least 1000 px wide (a short landscape window correctly shows "rotate to portrait").
3. Walk the whole journey: boot, a full round or flow, an error path (`?mockInitError=MAINTENANCE`), cash-out or claim paths, and every screen.
4. The console must have no errors and no image may fail to load (`[...document.images].filter(i => i.complete && !i.naturalWidth)` is empty).
5. Check the desktop frame (background) and a phone-width window. The shared frame carries no PBF product logo — it is reused by every game on the framework, not just PBF-branded ones.

If a dev server shows a blank page after you restructure files, restart it (Vite can keep a stale cached module).

## Definition of done

- [ ] Contract, mock backend and self-check exist and pass
- [ ] `index.ts` registered; `npm run dev -- <id>` boots to the first screen
- [ ] All screens built on the shared core pieces and PBF tokens and assets
- [ ] Pixi used only where listed in step 6
- [ ] `typecheck`, `lint`, `check`, `build` all green
- [ ] Browser walkthrough done with no console errors or broken images
- [ ] Mock-only parts are labelled `MOCK`; open backend questions are noted in doc 10
- [ ] Deliberate omissions are listed (what the PBF original has that this game does not)
