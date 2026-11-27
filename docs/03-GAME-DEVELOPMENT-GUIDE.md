# 03. Game development guide

How to add a game to this framework, and what must be true before it is done. Architecture background: [01-ARCHITECTURE.md](01-ARCHITECTURE.md). Reference games: `higherlower` (single screen, one Pixi scene), `accacrash` (single screen, curve scene), `lastmanstanding` (multi-view React game, no Pixi scene, server-owned fixture list and prize ladder), `cardpick` (made with `new-game --scene --sound`: a tappable Pixi scene, a keyboard twin for every canvas action, sound).

## Rules

1. **React owns everything**: screens, UI, state and API calls. Pixi is only for gameplay animation or heavy effects (card flip, crash curve, confetti). UI motion is CSS.
2. **A game is one folder**: `src/games/<id>`. The id is all lowercase, letters and digits only (`accacrash`), with no capitals, hyphens, spaces or other special characters. It never imports another game. Shared code goes in `src/core`.
3. **One game per dev server and per build.** There is no tab or game switcher. `GAME_ID` picks the game.
4. **The backend decides outcomes.** The client never computes results, balance or prices. Until the real contract exists (doc 09, open question Q1) the game uses a mock backend, clearly marked `MOCK`.
5. **Use PBF's real assets and design tokens.** Copy art from the PBF project (read only) into `public/assets/<id>/`, never edit the PBF project.
6. **No secrets in code or fixtures.** Tokens and credentials never go in the repo.

## Quick start

```bash
npm run new-game penaltyshootout "Penalty Shootout"
npm run dev penaltyshootout
npm run check
```

`new-game` creates the whole folder below with a working placeholder game (mock backend, self-check, screen, styles), registers the self-check in `package.json` and formats the files. The placeholder passes every check and builds as is, so you start green and replace the placeholder `play()` rules and screen with the real game. It refuses an id that already exists or is not lowercase letters and digits only.

Two optional flags add the parts a game may need (pass them after `--` with npm: `npm run new-game cardpick "Card Pick" -- --scene --sound`):

| Flag | Adds | Result |
|---|---|---|
| (none) | React only | no Pixi, no audio |
| `--scene` | `pixi/config/game.config.ts` (preload, design size, canvas share, elements), `pixi/config/config.check.ts`, `pixi/view/<Name>Scene.ts`; the screen draws it in a `<PixiStage critical>` and `renderer` becomes `'pixi'` | Pixi loads with the screen, never in the boot |
| `--sound` | `sound/sound.config.ts`, `sound/sound.check.ts` (valid config and every named file exists as mp3 and ogg), `public/assets/<id>/sounds/{mp3,ogg}/`; the screen calls `useSound` and shows a React mute button | the audio code loads with the screen, never in the boot; works with or without `--scene` |

`npm run verify-scaffold` proves the workflow on a clean copy of the project (`npm ci` in a temp folder, the four variants scaffolded, checked, type-checked, linted, built, and asserted to load Pixi and audio only where they are used; `-- --fast` reuses this workspace's `node_modules` for a quick run).

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
  sound/                    optional (`--sound`): sound.config.ts (the SoundGameConfig) and its self-check; the files are in public/assets/<id>/sounds/
  pixi/                     optional (`--scene`), all Pixi code: view/ holds one <Name>Scene.ts (or effect) per canvas, config/ holds one <name>.config.ts per canvas (all layout, styling, timings, assets, canvas portion) plus game.config.ts (the game-level PixiGameConfig: preload and effects)
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

export default defineGame({
  id: 'mygame',
  title: 'My Game',
  renderer: 'dom', // 'pixi' if the first screen has a <PixiStage critical>
  preload: [], // Pixi assets the first screen needs; everything else loads on demand
  // MOCK: replace with the real backend client once the contract exists (docs/09-BACKEND-INTEGRATION.md, Q1).
  createApi: (launch) => createMockServer({ currency: launch.currency ?? 'GBP', initError: mockInitError() }),
  loadScreen: () => import('./MyGameScreen').then((m) => m.MyGameScreen),
});
```

The core handles launch params, the loading lifecycle (session, fonts, screen code and critical assets in parallel, with real progress), blocking error screens, and the PBF desktop frame. The game only renders its screen. Loading rules (details in [05-LOADING-PERFORMANCE.md](05-LOADING-PERFORMANCE.md)):

- Keep `index.ts` light: it is in the boot bundle. Import the screen only through `loadScreen`, and import asset lists from config files, never from scene classes (that would pull Pixi into the boot bundle).
- A Pixi game sets `renderer: 'pixi'` and marks exactly one stage on its first screen `<PixiStage critical ...>`; the loading overlay stays up until that stage has drawn its first frame.
- `preload` lists only what the first screen draws. Use small game atlases (a 3-frame atlas, not a 21-frame shared one) and optimised SVGs.
- Files under `public/assets` are referenced through `assetUrl()` (`core/boot/assetUrl`), never as `/assets/...`: builds are served from any path and the URL carries a content version.

### 5. Build the screens

- Build every screen on `GameLayout` (`core/ui/GameLayout`): `header`, `stage`, `controls` fit in about half the mobile height and never scroll; rules, history and feeds go in `info`. Set `--pbf-play-min` in the game CSS; use `CanvasFrame fill` for canvases. See [06-RESPONSIVE-GAME-LAYOUT.md](06-RESPONSIVE-GAME-LAYOUT.md).


- Start from `GameHeader`, `StakeChips`, `useRoundEngine` (phase sequence; time phases with `useAtServerTime` / `useCountdown` from `core/round`), `useApiMessage` (error code to copy) from `src/core`.
- Reuse the `pbf-*` classes (`pbf-btn`, `pbf-card`, `pbf-pill`, `pbf-caption`) and tokens before writing new CSS.
- Multi-screen games keep a stack of screens in React state. Do not add a router.
- Money display always goes through `formatMoney`.

### 6. Add Pixi only where it earns its place

| Need | Use |
|---|---|
| Buttons, panels, transitions, counters, stamps | CSS |
| Small one-off effect (confetti, glow) | `startBurst` from `core/pixi/wrapper/PixParticleComp`, drawn inside the scene's stage; its numbers live in the game's `pixi/config/game.config.ts` |
| Reusable or eventful gameplay surface | a typed `PixiScene` class plus `<PixiStage>` |

Canvas code follows a view + config split and strict scene rules: see [04-RENDERING-REACT-PIXI.md](04-RENDERING-REACT-PIXI.md). Inside `GameLayout` wrap the stage in `<CanvasFrame config={config.canvas} fill>`.

### 7. Register the self-check

Add the check file to the `check` script in `package.json`:

```
node --experimental-strip-types --no-warnings src/games/<id>/api/mockServer.check.ts
```

`npm run check:games` fails if a game has a self-check that `check` does not run.

## Checks and verification

`typecheck`, `lint`, `check` and `build` must pass, and every visible change is verified in a browser,
including the layout sizes and an error path: see [10-TESTING-STANDARDS.md](10-TESTING-STANDARDS.md).
If a dev server shows a blank page after you restructure files, restart it (Vite can keep a stale module).

## Definition of done

- [ ] Contract, mock backend and self-check exist and pass
- [ ] `index.ts` registered; `npm run dev -- <id>` boots to the first screen
- [ ] All screens built on the shared core pieces and PBF tokens and assets
- [ ] Pixi used only where listed in step 6
- [ ] `typecheck`, `lint`, `check`, `build` all green
- [ ] Browser walkthrough done with no console errors or broken images
- [ ] Built on `GameLayout`: game and controls fit at every size in doc 10, info scrolls separately
- [ ] Loading measured (doc 10); no Pixi for a DOM game
- [ ] Mock-only parts are labelled `MOCK`; open backend questions are noted in doc 09
- [ ] Deliberate omissions are listed (what the PBF original has that this game does not)

## Worked examples

| Game | What it shows |
|---|---|
| `higherlower` | Timed shared rounds (`useRoundEngine`: betting 8 s, locked, reveal on the scene's `REVEAL_DONE`, result 1.6 s), one critical Pixi scene with a staged reveal, a confetti effect, intro and tutorial overlays, streak cash-out. Mock maths: "at least" markets, price floor(0.96/P, 2 dp), markets close below P 0.08 or above 0.92, streak bonus 5/10/15% at 3/4/5+ wins. |
| `accacrash` | Live crash rounds with server polling (betting 5 s, polling every 100 ms, ended 3 s), two bet panels with auto cash-out, a curve scene drawn from config, DOM cards and a simulated crowd. Mock maths: P(M >= x) = 0.96/x, multiplier e^(0.06 t), boosts 0.10/0.25/0.50 that never move the crash point. The server decides the paid multiplier (a button showing 1.26x paid 1.27x in a play test). |
| `lastmanstanding` | A multi-screen React game with no Pixi (`renderer: 'dom'`): setup, play, match playback, banked; server-owned fixtures and a 20-round prize ladder. |
| `cardpick` | Scaffolded with `--scene --sound`, then filled in. Three face-down cards as config elements, each a tap target (`UIUtil.bindInteractions`); every canvas pick has a keyboard-accessible React button that calls the same `pick`; the server (mock: one winner in three, RTP 0.96) decides and the scene only turns the cards over; sounds through `useSound` with a React mute control; PBF badge art (the 28 KB atlas Higher or Lower uses). `?mockSeed=N` repeats the mock draw for browser tests. |

Known omissions against the original prototypes: Higher or Lower has no 1-versus-2 mode switch, leaderboards
or sound. `cardpick` is the only game with sound.
