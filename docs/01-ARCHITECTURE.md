# 01. Architecture

How the framework is put together: the build model, the folder map, the module rules and the decisions
behind them. Each subsystem has its own doc (loading 05, layout 06, rendering 04, assets 07, backend 09).

## Stack

React 18.3.1 + TypeScript (strict) + Vite 5, PixiJS 8.9.2, npm, Node 22. Runtime dependencies are only
`react`, `react-dom` and `pixi.js`; there is no router, state library, animation library, GraphQL client or
socket client.

## Build model: one game per build

- `GAME_ID` picks the game. `vite.config.ts` resolves the alias `@game` to `src/games/<id>/index.ts`;
  `src/main.tsx` renders `<GameBoot game={game} />` inside React StrictMode. There is no game switcher.
- `npm run dev -- <id>` (`scripts/dev.mjs`) serves one game on port 3100 (next free port if taken).
- `npm run build [-- <id> ...]` (`scripts/build.mjs`) builds each game standalone into
  `../pbf-game-builds/<id>` (outside the project; `BUILD_DIR` overrides). Builds use `base: './'`, so they
  run from any path.
- `npm run new-game <id> "<Title>"` (`scripts/new-game.mjs`) scaffolds a working placeholder game
  (doc 03). Game ids are lowercase letters and digits only.

## Startup and runtime flow

```
index.html (inline loader, startup hints)
  -> main.tsx -> GameBoot (core/boot)
       launch params -> game.createApi(launch)
       in parallel: api.init(), fonts, game.loadScreen(), [Pixi games: preload assets, warm WebGL]
       -> AppShell (frame) -> game Screen on GameLayout (header, stage, controls, info)
            stage: DOM, or <PixiStage scene props onEvent> for canvas gameplay
            screen <-> api: calls return the new state; errors are ApiError codes
```

Details: loading lifecycle in doc 05, layout in doc 06, scenes in doc 04, backend in doc 09.

## Folder map

```
pbf-game-framework/
  index.html                 inline loader, title placeholder, empty favicon
  vite.config.ts             GAME_ID + @game alias, game-assets copy, asset versions, startup-hints
  package.json               scripts and the self-check list
  tsconfig.json, eslint.config.mjs, .prettierrc, .gitignore
  scripts/                   dev.mjs, build.mjs, check-games.mjs, new-game.mjs
  public/assets/
    common/                  shared art (stat icons, country flags)
    <id>/                    one game's own art
  src/
    main.tsx                 entry: <GameBoot game={@game} />
    game.d.ts                type of the @game module
    styles.css               PBF tokens, pbf-* components, app frame, game layout, boot screens
    core/
      assets/                fonts (WOFF2), desktop background (hashed by Vite)
      boot/                  GameBoot, launchParams, startup marks, loadQueue (+ check), assetUrl
      game/defineGame.ts     the game contract
      hooks/                 useRoundEngine (phase sequence; timing comes from server time), useApiMessage (error code to copy)
      pixi/                  PixiStage, scene contract, CanvasFrame, viewConfig (+ check), buildView,
                             theme, usePixiEffect, stageAssets, preload, warmup, AnimationServiceProxy,
                             GameConfigProxy, wrapper/ (PixParticleComp); also utils/LoggerService, hooks/useStageStatus
      services/              RoundEngine, ApiError, money, mockTransport (MOCK), services.check
      ui/                    AppShell, GameLayout, GameHeader, StakeChips
    games/<id>/
      index.ts               defineGame({...}) - the only file the core reads
      <Name>Screen.tsx       root screen (React)
      <id>.css               game styles
      api/                   types.ts (contract), mockServer.ts + mockData.ts (MOCK), mockServer.check.ts
      pixi/                  Pixi games: view/ (<Name>Scene.ts, effects) + config/ (<name>.config.ts, config.check.ts)
      screens/               multi-screen games: one file per screen group
  docs/                      this documentation; docs/archive holds history and evidence
```

## Module rules

| Rule | Enforced by |
|---|---|
| A game never imports another game | `scripts/check-games.mjs` |
| The core never imports a game (only `main.tsx` reads `@game`) | review |
| Scenes never import React, stores or services; props in, events out | review (doc 04) |
| The boot never imports Pixi; DOM games never load it | build hints + review (doc 05) |
| The client never decides outcomes, prices or the wallet | review; mocks are marked `MOCK` (doc 09) |
| A game's `index.ts` stays light: screen only through `loadScreen` | review (doc 05) |

## Decisions

| ID | Decision | Reason |
|---|---|---|
| D-001 | React-first: React owns the app; Pixi only renders gameplay, with one Application per `<PixiStage>` mount | The original PBF game draws most of its UI in Pixi: its canvas chunk is 2,800 kB (701 kB gzip) against under 310 kB for its other chunks, with 1,300 to 2,100-line classes mixing UI and gameplay. Per-mount Applications avoid shared state; context reuse would only be adopted if the lifecycle checks failed (they passed, doc 04). |
| D-002 | The original game (Ultimate Soccer) stays as it is, in its own repository | Its operator integrations (four platform strategies) cannot be changed without operator tests |
| D-003 | This framework is a separate project; the PBF repository is never modified from it | Keeps the live game safe; reuse means copying assets and code, never importing from the PBF repo |
| D-004 | One game per build, chosen by `GAME_ID` | Each game ships alone, smallest bundle, no cross-game coupling |
| D-005 | No `@pixi/react` | It needs React 19; the project stays on React 18.3.1 |
| D-006 | Mock backends implement the same TypeScript contract the real backend must implement | Games are built and tested before backend contracts exist, without inventing client maths |

Non-goals: no Application shared between stages, no client-side outcomes, no slot-machine concepts in
the core (PBF games are not slots: no reels, paylines or client RNG).

## Known limitations

- No real backend client, no operator messaging, no socket layer (doc 09).
- No translation system (doc 02, requirement 5).
- Each build is self-contained: shared files are not cached across games (doc 07).
