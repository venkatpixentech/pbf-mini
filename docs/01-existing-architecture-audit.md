# 01. Existing architecture audit (PBF Ultimate Soccer)

Status: audit only, no source changed. Evidence date: 2026-11-23.
Repo: `pbf_ultimatesoccer_fe_v1` (paths below are relative to its root unless they start with `src/canvas/`, which is also relative to the root).
Method: direct reading plus three focused read-only audits (canvas, backend, shell), with the critical claims re-checked by hand. Nothing was run; there is no test suite.

## 0. Scope note on the master prompt
The master prompt is written for a slot framework. PBF is not a slot game. Verified absent in code: reels, reel strips, symbols, paylines, ways, spin/stop-spin, free spins, client RNG or client win calculation. Those prompt sections are mapped to their real PBF equivalents (round lifecycle, match simulation, bet slip, rewards features) and marked "N/A (verified absent)" where nothing maps. The framework is designed from PBF evidence only; no other client's code or internals are used.

## 1. Folder structure (verified)
```
index.html                 shell entry -> src/index.tsx
canvas/index.html          canvas entry -> src/canvas/main.ts
canvas/assets/             63 MB runtime art, copied verbatim to build/canvas/assets-<id>/
canvas/src_assets/         28 MB raw TexturePacker sources (not used at build)
public/                    16 MB shell static files (fonts, icons, images)
src/                       React 18 shell (App, router, components, pages, store, apollo, i18n, firebase)
src/canvas/corelib/        "engine" layer, about 28k lines
src/canvas/teamformation/  game layer, about 86k lines
src/graphql/main|canvas/   .gql per client; codegen to src/generated and canvas generated SDK
docs/, .argus/, infra-repro/, buildspec.yml, bitbucket-pipelines.yml
```

## 2. Audit by area
Each row: what exists, where, and the verdict for reuse.

| # | Area | What exists (file: responsibility) | Reuse verdict |
|---|---|---|---|
| 1 | Folder/file structure | As above. Two Vite entries in `vite.config.mjs` | Keep the two-entry model |
| 2 | Existing games | One live game (Ultimate Soccer). Three new-game prototypes as standalone HTML (see doc 02) | Ultimate Soccer is the reference implementation |
| 3 | Shared/core classes | `src/canvas/corelib/pixiwrapper/*` (BaseView, Pix* wrappers), `corelib/utils/UIUtilService.ts` (element factory + layout, 2023 lines), `corelib/models/*` proxies, `corelib/sound/*` | Reusable after removing game leaks (section 3) |
| 4 | Pixi init and render lifecycle | `teamformation/app/gameApp.ts` `init()` creates TWO Applications: `appTop` (140px top bar, lines 108-115) and `app` (118-127), resolution min(DPR,2). Resize at `resize()` 1167-1206, portrait only. Separate never-stopping rAF loop dispatching `ON_FRAME_UPDATE` (1103-1120). `settings.*` from `@pixi/core` 7.4.3 set at 93-95 have no effect on pixi.js 8.9.2. WebGL context loss handler commented out (133-136). Devtools hooks set in production (157-167) | Generic lifecycle is buried in a 1336-line game controller. Target: per-mount `<PixiStage>` (doc 03 rev 2); legacy US keeps it until migrated |
| 5 | Scene/container management | `teamformation/views/ScreenContainer.ts` (2081-line god class): `showView()` with one-slot queue, hard-coded switch to `showXView()`, `cleanUpView()` unloads bundles. Routes in `teamformation/models/screenStates.ts` (`SCREENVIEWS` 19 routes, `NAV_STATES`). Route events via `GameEvents.APP_ROUTE_CHANGE` -> `GameAppScreen.onRouteChange()` | Pattern is sound; implementation is game-coupled. Replace switch with a screen registry |
| 6 | Reel and symbol management | N/A (verified absent) | Not part of this framework |
| 7 | Spin / stop-spin | N/A. The equivalent is the round: place bet -> start match -> simulation -> result (doc 07) | Becomes `RoundEngine` |
| 8 | Win calculation and presentation | No client win calculation. Results come from GraphQL `MatchResult` (`src/graphql/canvas/MatchResult.gql`), shown by `teamformation/views/MatchResultView.ts`; win celebration Spine loaded at `gameApp.ts:1242-1252` | Keep server-authoritative; generalize presentation |
| 9 | Paylines and ways | N/A (verified absent) | Not part of this framework |
| 10 | Free spins, bonus, special features | No free spins. PBF features: boosters, trophy pot/vault and penalty, challenges, daily rewards, packs and pack opening, divisions/leagues, weekend champions, quick swap, fatigue, FTUE | Become game-level feature modules |
| 11 | Backend integration | Shell Apollo `src/apollo/client.ts` (Bearer from `sessionHelper.beToken`, requestId enrichment, `no-cache`). Canvas `graphql-request` `src/canvas/corelib/models/services/graphqlClient/graphqlClientService.ts` (error middleware defined but never wired). Socket.io `corelib/models/services/socket/SocketService.ts`. `MessageServiceProxy.ts` holds dozens of game API calls. `HTTPService.ts` (axios) has no callers | Transports reusable; API calls split into game modules |
| 12 | Game config and initialization | `teamformation/config/GameConfig.ts` hard-codes identity (`gameName`, `gameId`, paths). `corelib/models/GameConfigProxy.ts` is an untyped mutable bag with slot leftovers (`isTurboOn`, `symbolsData`) | Replace with typed `GameDefinition` + runtime context |
| 13 | Asset loading and textures | `corelib/models/services/AssetLoader.ts` builds a Pixi `Assets` manifest from `teamformation/config/AssetConfig.ts` (PRELOADER, PRIMARY.COMMON, 13 named BUNDLES). Resolution folders `@1x`/`@0.5x` picked in `corelib/models/DeviceConfigProxy.ts:59-65`. World Cup skin = full duplicate config `AssetConfigWC.ts`. Loader already supports a `common` asset TYPE, but no `common/` folder exists. Details in section 4 | Reusable; becomes the shared PBF asset pack |
| 14 | Spine | `corelib/pixiwrapper/PixSpine.ts` (`@pixi/spine-pixi` 2.1.1) plus direct `Spine.from` in views. Spines are NOT in the asset config; paths built ad hoc in views (`RewardCelebrationComp.ts:378-382`, `gameApp.ts:1245-1252`) | Bring under the asset manager |
| 15 | Audio | Howler `corelib/sound/SoundServiceProxy.ts` (`SoundFactory`), event-bound by `corelib/sound/SoundManager.ts` from `teamformation/config/SoundLoadConfig.ts`. `SoundManager` constructed twice (`gameApp.ts:580`, `ScreenContainer.ts:762`), risk of double binding. `SoundServiceProxyPixi.ts` unused | Reusable, fix single ownership |
| 16 | UI components | Canvas: config-driven views via `UIUtil.getElement` (26 element types). Shell: generic primitives (`Button`, `Typography`, `Tab`, `Accordion`, `NumbersKeypad`, `TextFeild`, `Loader`, `Modal`, `Drawer`) plus game widgets. Stake panel `src/pages/stakePannelOptions/components/StakePannelInput.tsx` is 1856 lines | Generic primitives reusable; stake panel must be split |
| 17 | Events and communication | Canvas bus `corelib/pixiwrapper/EventHandlerService.ts` on `app.stage` (untyped). `AppEvents.ts` 19 keys, `GameEvents.ts` 77 keys, about 223 raw string event names in use. `AppEvents.SHOW_ERROR` dispatched but undefined (`MessageServiceProxy.ts:957`). Shell bus `src/util/eventHandler.ts` (CustomEvent on window). Bridge: shell calls `contentWindow.gameExtension(data)` from 8 places; canvas `postMessage(data,'*')` from `WrapperServiceProxy.ts:1009` | Keep buses; type them; replace the untyped bridge |
| 18 | State management | Canvas `corelib/models/services/AppModelService.ts` (1023 lines, mostly game data). Shell `src/store/gameStore.ts` (one Zustand store, no slices) and `src/service/sessionHelper.ts` singleton. No formal state machine: flow is imperative in `gameApp.checkToShowScreen` and resume paths (598-906), resume logic copy-pasted 3 times | Introduce core state + game extensions; add a round phase machine |
| 19 | Error handling and recovery | Canvas `MessageServiceProxy.showErrorPopUp` (1460) maps backend codes via `corelib/utils/BeErrorCodeTranslationKeyMap.ts`; 2420/2436/2449 -> init error, 60000 -> maintenance. Shell `ErrorPopUpModal.tsx` uses a DIFFERENT map `src/i18n/BeErrorCodeTranslationKeyMap.ts`. Only `StartMatch` retries (3x backoff). No global error handlers (commented out in `main.ts`). "refresh" error type leaves no buttons (`ErrorPopup.ts:254`) | Unify error mapping and recovery in the engine |
| 20 | Build, deploy, test | `vite.config.mjs` (versioned canvas asset folder, console dropped in prod), `codegen.ts`, `buildspec.yml` (4-pass S3 sync + CloudFront), `bitbucket-pipelines.yml` (dev, staging, QA, workbench). Husky + lint-staged. No test runner, no test files; `src/canvas/corelib/test.ts` is empty | Keep pipeline; add tests |

## 3. Engine-to-game leaks (the main blocker)
`src/canvas/corelib/` imports game code here (verified):
- `corelib/models/MessageServiceProxy.ts:1,2,3,42,43,44` (formation config, `GameUtilClass`, `FtueStageUtils`, mock `simulation_data`, `ChallengesView`, `screenStates`)
- `corelib/models/services/AppModelService.ts:1,22` (mock `player-position`, `PlayerCardItemV2` view)
- `corelib/models/services/AssetLoader.ts:2` (`config/AssetConfig`)
- `corelib/models/WrapperServiceProxy.ts:8` (`screenStates`)
- `corelib/utils/UtilService.ts:6` (`formationConfig`)

One correct injection already exists: `Util.setGameUtilClass(GameClassUtil)` (`corelib/utils/UtilService.ts:193`, called at `gameApp.ts:85`). The framework generalizes this pattern.

## 4. Assets (the user asked for this check)
| Check | Result |
|---|---|
| Configured sprite atlases exist at `@1x` and `@0.5x` | All present (both `AssetConfig.ts` and `AssetConfigWC.ts`) |
| Configured sounds exist as mp3 and ogg | All 21 present; no unconfigured sound files |
| Unreferenced atlases | About 28 atlas pairs with no reference in code: `whiteBlast_gold0..17`, `goldfxAnimation*`, `cameraFlashAnim_gold`, `fireWorkAnim_gold`, `shineAnimation`, `homeScreenAssets2` (about 7.6 MB). Not removed; confirm with art before deleting |
| Spine | 14 skeletons under `canvas/assets/spines/<Country|Tier|effects|WinCelebration>/`, loaded ad hoc from views, no resolution variants, names contain spaces |
| Path model | `AssetLoader.createPathMap()` supports TYPE `game` and `common`. `common` points to `common/...`, which does not exist; its bmpfont path has a stray `}` (`common/fonts/bmp/}`) |
| Hard-coded language | Fonts and content paths fixed to `en` (`AssetLoader.createPaths`) |
| Naming | Mixed: spaces in spine and sound names, typos kept as API (`matchSimulationAsstes`) |
| Failure handling | `ASSET_LOAD_FAILED` dispatched (`AssetLoader.ts:111, 314`) but nothing listens |
| Dynamic assets | Banners, player cards, country icons, logos under `canvas/assets/images/dynamicassets/` (about 8 MB); badges, jerseys, flags come from backend URLs at runtime |
| Skins | World Cup is a full duplicate asset config with `_wc` suffixes |

Conclusion for the new games: PBF's asset tree can serve as the shared pack as-is. The framework maps TYPE `common` to the existing PBF asset root, so Ultimate Soccer URLs do not change, and each new game adds only its own folder (doc 04).

## 5. Verified defects relevant to the framework
| ID | Defect | Evidence |
|---|---|---|
| D1 | Canvas sound toggle throws in the shell (temporal dead zone) and is swallowed | `src/pages/home/Home.tsx:169` declares `const settingsData` in `case meData`; `case toggleSound` reads it at 364 |
| D2 | Min stake compared as strings | `StakePannelInput.tsx` around 337-357 (`stakeString < sessionHelper.minBet`) |
| D3 | `process.env.REACT_APP_*` under Vite, inside a dead branch | `src/components/PixiContainer.tsx:75-77` |
| D4 | Listener removals that remove nothing | `src/components/SessionHelper.tsx:53`, `Home.tsx:427` |
| D5 | Responsive views add `APP_RESIZE` listeners with inline `bind` and never remove them | `corelib/pixiwrapper/ResponsesiveView.ts`, `ResponsesiveChildrenView.ts`, `BaseScreen.ts` |
| D6 | `SHOW_SIMULATION` handled twice, so simulation starts twice | `ScreenContainer.ts:1676, 1680` |
| D7 | `window.unmountScreen` calls a method that does not exist | `WrapperServiceProxy.ts:68` -> `facade.unmountView` |
| D8 | Unknown element type or class throws a bare TypeError | `UIUtilService.ts:175` |
| D9 | Two Pixi v7 particle and settings APIs used against Pixi v8 | `PixParticleComp.ts` (dead), `gameApp.ts:93-95` |
| D10 | `AppEvents` has two keys with the same string | `corelib/events/AppEvents.ts` (`ASSET_LOADING_PROGRESS`, `ASSET_LOADING_COMPLETE`) |
| D11 | Mock data imported on production paths | `teamformation/mock-data/*` used by `SimulatorComp`, `AllPlayersComp`, `RTPDisplayComp` and others |
| D12 | Two different backend error-code maps | `src/i18n/BeErrorCodeTranslationKeyMap.ts` vs `src/canvas/corelib/utils/BeErrorCodeTranslationKeyMap.ts` |

Security findings are in doc 10. None of these are fixed by the framework work silently; each is either a separate approved fix or kept as-is behind the baseline.

## 6. Dead or duplicated code (do not migrate)
`corelib/test.ts`, `SimulatorComp2.ts`, `SimulatorCompOld.ts`, `SimMaker.ts`, `PlayerCardTemp.ts`, `PixParticleComp.ts`, `SoundServiceProxyPixi.ts`, `HTTPService.ts`; shell `pages/vault/Vault.tsx`, `pages/home/components/HomeCard.tsx`, `components/drawers/TeamEditDrawer.tsx` (v1), `NumberCounter`, `LazyLoader`, `ImgLazyLoader`, `hooks/useModal.tsx`, `hooks/UseAnimatedCounter.ts`. Parallel versions (V1/V2) exist for top bar, player card, daily reward item, error popup, pack opening. Two `ModalPopup`, `GameView` and `MaintenanceView` files each. `src/canvas/AGENTS.md` is empty and `src/canvas/CLAUDE.md` wrongly says `main.ts` attaches the window handlers.
