# 04. Complete folder and file structure (React-first)

Revision 2, 2026-11-23. Part A is the target structure. Part B lists what stays in place during migration.
Legend: **N** new, **R** existing file moved or refactored with behaviour kept, **K** kept in place. **M** mandatory, **O** optional.

---
# Part A: Target structure

```
src/
  app/                       React root
  framework/
    contract/                game definition and validation
    ui/                      design system, hosts
    state/                   core store
    services/                session, api, socket, round, bet, audio, wrappers, analytics, i18n, errors, logger
    pixi/                    PixiStage, scene contract, stage assets, spine, FX layer, view re-exports
    legacy/                  LegacyCanvasFrame + typed legacy bridge (Ultimate Soccer)
  games/
    ultimate-soccer/         US React parts (shell pages, drawers, stake panel, store slice)
    higher-lower/            new game
    acca-crash/              new game
    last-man-standing/       new game
  canvas/                    legacy US Pixi app (unchanged until migration stage M4)
  graphql/
    main/ canvas/            existing (unchanged)
    framework/               core operations for new games (subset of existing Init etc.)
    <gameId>/                per new game, once its backend contract exists
canvas/assets/               existing PBF Pixi assets (atlases, spine, sounds) = shared pack
canvas/assets/games/<gameId>/  stage assets for new games
tools/                       validation and baseline scripts
tests/                       unit, component, e2e
```

## A1. `src/app`
| Path | Type | Req | Responsibility | Today |
|---|---|---|---|---|
| `app/main.tsx` | R | M | React entry | `src/index.tsx` |
| `app/App.tsx` | R | M | Providers (Apollo, store, i18n, notifications), router | `src/App.tsx` |
| `app/AppShell.tsx` | R | M | Frame width, viewport `--vh`, rotate message, hosts | `src/components/AppShell.tsx` |
| `app/router/routes.ts` | N | M | Collects `routes` from game definitions | `src/router/config.tsx` |
| `app/router/Router.tsx` | R | M | HashRouter (kept), lazy routes outside render bodies | `src/router/Router.tsx` |
| `app/games.ts` | N | M | List of enabled game definitions | n/a |

## A2. `src/framework/contract`
| Path | Type | Req | Responsibility |
|---|---|---|---|
| `GameDefinition.ts` | N | M | `GameDefinition`, `RouteDef`, `StageAssetPack`, `GameApi` types |
| `ConfigSchema.ts` | N | M | Ranged config fields, `validateConfig` |
| `validateDefinition.ts` | N | M | CI and dev-time checks (routes, scenes, assets, config) |

## A3. `src/framework/ui`
| Path | Type | Req | Responsibility | Today |
|---|---|---|---|---|
| `primitives/*` (Button, Typography, Tab, Accordion, TextField, Loader) | R | M | Generic UI | `src/components/*` |
| `NumbersKeypad.tsx` | R | M | Keypad, layout from config | `src/components/NumbersKeypad.tsx` |
| `bet/StakeInput.tsx` | R | M | Generic stake entry | extracted from `StakePannelInput.tsx` |
| `bet/MinMaxStakeModal.tsx` | R | M | Limit messages | `src/components/modals/MinMaxStakeModal.tsx` |
| `BalanceDisplay.tsx`, `WinDisplay.tsx` | N | M | Shared HUD pieces | inline today |
| `hosts/DrawerHost.tsx`, `ModalHost.tsx` | R | M | Registry-driven | `drawers/DrawerRenderer.tsx`, `modals/ModalRenderer.tsx` |
| `hosts/PopupHost.tsx` | N | M | Error, network, maintenance, session popups in one priority stack | `ErrorPopUpModal.tsx`, `CanvasPopUpModal.tsx` |
| `Drawer.tsx`, `Modal.tsx` | K | M | Base components | `src/components/*` |
| `tokens.css` | N | M | PBF design tokens (`--action-primary`, `--pbf-*`, ...) | Tailwind config + prototypes |

## A4. `src/framework/state`
| Path | Type | Req | Responsibility | Today |
|---|---|---|---|---|
| `coreStore.ts` | R | M | Session snapshot, balance, settings, connectivity, hosts state | generic fields of `src/store/gameStore.ts` |
| `registerGameSlice.ts` | N | M | Adds a game slice | n/a |

## A5. `src/framework/services`
| Path | Type | Req | Responsibility | Today |
|---|---|---|---|---|
| `api/apolloClient.ts` | R | M | Apollo client, auth link (Bearer `beToken`), request-id error link | `src/apollo/client.ts` |
| `api/errorMap.ts` | R | M | Single backend error-code table | both `BeErrorCodeTranslationKeyMap.ts` |
| `api/responseGuards.ts` | N | M | Runtime checks on init and round responses | n/a |
| `session/SessionService.ts` | R | M | Operator token, `Init`, `beToken` in memory, demo launch only when enabled | logic in canvas `MessageServiceProxy` (new-game path only) |
| `socket/SocketService.ts` | R | M | socket.io, heartbeat, typed events | canvas `SocketService.ts` (new-game path) |
| `round/RoundEngine.ts`, `RoundState.ts` | N | M | Phase machine | n/a |
| `bet/BetSlip.ts`, `Money.ts`, `StakeValidator.ts` | N | M | Bet actions, numeric limits, formatting | parts of `StakePannelInput.tsx`, `util/miscUtils.ts` |
| `audio/SoundService.ts` | R | M | Howler, buses, mute | canvas `SoundServiceProxy.ts` (new-game path) |
| `wrappers/OperatorWrapper.ts` + adapters | R | M | Operator messages from the app window | canvas `WrapperServiceProxy.ts` (new-game path) |
| `analytics/analytics.ts` | K | M | Firebase + backend fallback | `src/service/firebaseAnalytics.ts` |
| `i18n/*` | K | M | i18next | `src/i18n/*` |
| `errors/ErrorService.ts` | N | M | Classification, actions, global handlers | n/a |
| `logger.ts` | N | M | Levels, redaction, off in prod | n/a |

## A6. `src/framework/pixi`
| Path | Type | Req | Responsibility | Depends on |
|---|---|---|---|---|
| `PixiStage.tsx` | N | M | Pixi Application lifecycle per mount (create, attach, resize, pause, context loss, destroy) | pixi.js, scene contract |
| `scene.ts` | N | M | `PixiScene<P,E>`, `SceneContext`, `SceneFactory` types | none |
| `stageAssets.ts` | N | M | Loads and unloads a scene's assets (atlases, spine, fonts) from `canvas/assets` and `canvas/assets/games/<id>` | pixi.js Assets, `__ASSETS_DIR__` |
| `spine.ts` | N | O | Spine creation helper over `@pixi/spine-pixi` | spine-pixi |
| `FxLayer.tsx` | N | O | Transparent overlay stage, mounts per effect | PixiStage |
| `view/index.ts` | N | O | Re-exports existing `src/canvas/corelib/pixiwrapper` classes for scenes (no copy) | legacy source |
| `devtools.ts` | N | O | Pixi devtools hook in dev only | pixi.js |

## A7. `src/framework/legacy`
| Path | Type | Req | Responsibility | Today |
|---|---|---|---|---|
| `LegacyCanvasFrame.tsx` | R | M | Hosts the US canvas iframe with cache-buster | `src/components/PixiContainer.tsx` |
| `legacyProtocol.ts` | N | M | Typed union of every existing bridge message, both directions | `CanvasMessage` enum + `any` |
| `legacyBridge.ts` | R | M | Single shell-side sender/listener with origin check | `SessionHelper.tsx`, `util/miscUtils.ts`, `Home.tsx` copies |

## A8. `src/games/<id>` (new game template)
| Path | Req | Content |
|---|---|---|
| `definition.ts` | M | `GameDefinition` |
| `routes.tsx` | M | React routes |
| `screens/*.tsx` | M | React screens |
| `components/*.tsx` | O | Game UI components |
| `scenes/<Name>Scene.ts` | M | Pixi scenes implementing `PixiScene<P,E>` |
| `scenes/<Name>Scene.types.ts` | M | Props and event types |
| `config/game.config.ts` | M | Config values (schema-validated) |
| `config/stageAssets.ts` | M | Scene assets (common names + game files) |
| `round/round.ts` | O | `RoundDefinition` |
| `api/*.ts` | M | Typed functions over Apollo documents |
| `state/slice.ts` | O | Zustand slice |
| `features/*` | O | Feature modules |
| `content/*.json` | M | Copy keys |
| `assets/ui/*` | O | UI images imported by components (Vite-hashed) |

## A9. `src/games/ultimate-soccer`
| Path | Type | Req | Content | Today |
|---|---|---|---|---|
| `definition.ts` | N | M | Routes (`/home`, `/playcheck`), legacy frame, slice | n/a |
| `screens/Home.tsx` | R | M | Hosts `LegacyCanvasFrame`, canvas-event handling split into core and game handlers | `src/pages/home/Home.tsx` |
| `screens/Bets.tsx`, `Wallet.tsx`, `Playcheck.tsx` | R | M | As today | `src/pages/*` |
| `drawers/*`, `modals/*` | R | M | Game drawers and modals | `src/components/drawers/*`, `modals/*` |
| `stakePanel/*` | R | M | Football markets and slip | `src/pages/stakePannelOptions/*` |
| `state/slice.ts` | R | M | Game fields | `src/store/gameStore.ts` game part |
| `session/usSession.ts` | R | M | Game fields of session | `src/service/sessionHelper.ts` game part |

## A10. Assets
| Location | Content | Served as |
|---|---|---|
| `canvas/assets/**` | Existing PBF Pixi atlases, spine, sounds, locale | `canvas/assets-<id>/` (versioned, unchanged) |
| `canvas/assets/games/<gameId>/**` | New games' stage assets | Same versioned folder |
| `src/framework/ui/assets/**`, `src/games/<id>/assets/ui/**` | UI images exported from `canvas/src_assets` | Vite-hashed into `build/assets` |
| `public/**` | Existing shell static files | Unchanged |

## A11. Tools and tests
| Path | Type | Req | Purpose |
|---|---|---|---|
| `tools/baseline/*` | N | M | Captures GraphQL ops, bridge messages, socket events, operator messages per platform strategy, asset URLs |
| `tools/validate-assets.mjs` | N | M | Stage asset entries exist at both resolutions; sounds exist; no duplicate paths |
| `tools/validate-games.mjs` | N | M | Runs `validateDefinition` for each game |
| `tools/check-boundaries.mjs` | N | M | Import rules from doc 03 A3 |
| `tests/unit/**` | N | M | Vitest (approval needed) |
| `tests/component/**` | N | M | React Testing Library (approval needed) |
| `tests/e2e/**` | N | O | Playwright smoke and device runs (approval needed) |
| `tests/pixi/**` | N | M | PixiStage lifecycle checks V1 to V8 |

---
# Part B: Migration layout (what stays where, and when it moves)

| Item | During M0 to M3 | Moves at |
|---|---|---|
| `src/canvas/**` (US Pixi app, its GraphQL client, socket, wrappers, assets loader) | Stays, runs in `LegacyCanvasFrame` | Screen by screen in M3; removed in M4 |
| `src/graphql/canvas/**` and its codegen target | Stays | M4 |
| `src/graphql/main/**` | Stays; framework reuses Apollo documents where identical | n/a |
| `src/components/PixiContainer.tsx` | Becomes `framework/legacy/LegacyCanvasFrame.tsx` in M1 | M1 |
| `src/pages/**`, drawers, modals, `gameStore.ts`, `sessionHelper.ts` | Move to `games/ultimate-soccer` and `framework/*` in M1 with no behaviour change | M1 |
| `canvas/assets/**` | Unchanged path and URLs | never (shared pack) |
| `vite.config.mjs` entries | Keep both entries (`index.html`, `canvas/index.html`) | Canvas entry removed in M4 |
| `buildspec.yml`, `bitbucket-pipelines.yml` | Unchanged | Reviewed in M4 |

Rule: a file moved in M1 is a pure move (no logic edits in the same PR).
