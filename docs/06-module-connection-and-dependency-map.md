# 06. Module connection and dependency map (React-first)

Revision 2, 2026-11-23. Part A: target connections for new games. Part B: legacy Ultimate Soccer (US) connections, preserved during migration and used as the baseline.

---
# Part A: Target connections

## A1. Dependency graph
```
app ──► games/<id> ──► framework/{ui, state, services, pixi, contract}
                          services ──► contract
                          ui ──► state, services (via hooks)
                          pixi ──► contract (scene types only)
games/<id>/scenes ──► framework/pixi (types, view re-exports) ONLY
framework ──X──► games, app            (forbidden)
games/<a> ──X──► games/<b>             (forbidden)
scenes ──X──► React, stores, Apollo, services   (forbidden)
```

## A2. Boot (new game)
| # | Step | Owner | Data / event |
|---|---|---|---|
| 1 | React mounts, providers ready | `app/App.tsx` | |
| 2 | Platform strategy and URL params read | `services/wrappers` | operator token (never logged) |
| 3 | Session start: `Init` with the existing core field subset | `services/session` -> `services/api` | `beToken` kept in memory |
| 4 | Socket connect | `services/socket` | `auth: { token }` |
| 5 | Operator "loaded / progress / ready" messages | `services/wrappers` | same message set per platform as today |
| 6 | Route to game entry screen | `app/router` | |
| 7 | Screen renders React UI; mounts `<PixiStage>` only if the screen has gameplay | `games/<id>/screens` | |

## A3. Screen with a Pixi scene
```
React screen
  ├─ reads store / round state
  ├─ <PixiStage scene={CardRevealScene} props={...} assets={...} onEvent={handle}/>
  │     mount:   create Application -> load stage assets -> scene.init(ctx)
  │     update:  props change -> scene.update(props)
  │     resize:  ResizeObserver -> scene.resize(w,h)
  │     hidden:  ticker paused
  │     unmount: scene.destroy() -> unload stage assets -> app.destroy()
  └─ handle(event): calls services (bet, round) or updates store
```
Contract: React -> scene through `props` only; scene -> React through `onEvent` only. Scenes never call the backend.

## A4. Round (new game, server-authoritative)
| # | Step | Owner | Contract |
|---|---|---|---|
| 1 | Round opens (timer or server push) | `services/round` | `ROUND_PHASE_CHANGED` |
| 2 | Player stakes and confirms | React UI -> `services/bet.place` | new backend operation (doc 07 section 6) |
| 3 | Server ack, balance update | `services/api`, socket `USER_BALANCE_UPDATE` | existing event |
| 4 | Gameplay plays | React passes round data -> scene props | scene emits `ANIMATION_DONE`, `CASH_OUT_PRESSED` |
| 5 | Cash out (if game supports) | `services/bet.cashOut` -> server decides | new backend operation |
| 6 | Result | server -> `services/round` result phase -> scene props -> React result UI | |
| 7 | Effect | React mounts `<FxLayer>` for celebration, unmounts when done | |

## A5. Errors
```
Apollo error link / socket / scene context-loss / global handler
   └─► services/errors.classify ─► action (retry | reload | block | dismiss)
          └─► ui/hosts/PopupHost (priority: init > maintenance > session > network > business)
```

## A6. Operator messaging (target)
New games send operator messages from the app window to `window.parent` (one hop). The message names and payloads per platform strategy are the same as today's baseline (Part B, B4). Any difference in hop count or target is validated with tests OP1 to OP6 (doc 08) before it is used in production.

---
# Part B: Legacy connections (Ultimate Soccer, unchanged)

## B1. Boot (today, file references)
| Step | File:line |
|---|---|
| Shell mounts iframe | `src/components/PixiContainer.tsx:105` |
| Canvas creates two Pixi apps | `src/canvas/teamformation/app/gameApp.ts:108-127` |
| Canvas -> shell `CANVAS_READY` | `gameApp.ts:223` |
| Shell -> canvas `URLS` | `src/components/SessionHelper.tsx:27` |
| Operator token from parent URL hash | `src/canvas/teamformation/utils/GameUtilClass.ts:431`, `gameApp.ts:355-364` |
| Optional demo launch | `src/canvas/corelib/models/MessageServiceProxy.ts:164-215` |
| `Init` | `gameApp.ts:384`, `MessageServiceProxy.ts:222-235` |
| Socket connect | `MessageServiceProxy.ts:76-80` |
| Asset bundles | `gameApp.ts:401` |
| `FatigueConfigList`, `GetTotalClaimableRewards` | `gameApp.ts:404-405` |
| `INIT_DATA` to shell | `WrapperServiceProxy.ts:781-788` |
| `GetPlatformRtp`, `Me`, `AllBadges` | `gameApp.ts:482-485` |
| `MyTeam` | `gameApp.ts:547/557` |
| First screen (`HomeData`, `GetActiveChallenges`, `AllLeagueDetails`, `GetPromoPackOffer`, `CurrentBetSlip`) | `gameApp.checkToShowScreen` from 598 |

## B2. Round (today)
| Step | Operation | Caller |
|---|---|---|
| Odds | `Odds` (`main/stakePannelOddsOptionsList.gql`) | `src/pages/home/Home.tsx` `showBet` |
| Slip | `AddUpdateBet`, `RemoveBetFromSlip` | `src/hooks/useHandleAddUpdateOdds.tsx` |
| Place bet | `PlaceBet`, `CurrentBetSlip`; shell -> canvas `BET_PLACE_RESPONSE` | `StakePannelInput.tsx handlePlaceBet` |
| Start match | `LastMatchDetails`, `CurrentBetSlip`, `StartMatch` (3 retries) | `ScreenContainer.ts:913-924` |
| Simulation | server `slots[].events[]` replay | `SimulatorComp.showSimulation` |
| Result | `EndMatch`, `GetPostMatchChallengeUpdates`, `MatchResult` | `gameApp.ts:1035` |
| Balance | socket `USER_BALANCE_UPDATE` | `MessageServiceProxy.ts:106-118` |
| Credit pending | Init flags + socket `CREDIT_PENDING_UPDATE` | `GameAppScreen.ts:1045` and 3 views |
| Void / delayed credit | socket `SHOW_POPUP` | `Home.tsx:211`, `CanvasPopUpModal.tsx:75` |
| Resume | `lastMatchDetails.matchStatus` | `gameApp.resumeNormalUser`, `checkToResumeLastMatchState` |

## B3. Legacy bridge inventory (baseline names)
Shell -> canvas (`contentWindow.gameExtension`, `CanvasMessage` in `src/core/enums.ts:114-151`): URLS, CONFIG_DATA, STOP_CANVAS, RESUME_CANVAS, IS_AUDIO_ON, ODDS_TYPE, SETTINGS_CLOSED, WINDOW_RELOADED, LEADERBOARD_CLOSED, LEADERBOARD_CLOSED_2_0, TEAM_EDIT_CLOSED, START_SIMULATION, ROUND_STARTED_DATA, SHOW_TEAM_LIST, BET_PLACE_RESPONSE, Pop_Up_*, REDIRECT_TO_PENALTY_SCR; plus `socketService.emit('POPUP_SHOWN')`.
Canvas -> shell (`postMessage`, `WrapperServiceProxy.ts:712-1104`): about 60 names (CANVAS_READY, INIT_DATA, ME, ALL_BADGES, TEAM_DATA, UPDATE_BALANCE, SHOW_BET_PANEL, SHOW_SETTINGS, SHOW_POPUP, SHOW/HIDE_DISCONNECTION, TOGGLE_SOUND, RELOAD_APP, HOME, MY_BETS, WALLET, SHOW_RULES, FTUI_COMPLETE, CURRENT_LEAGUE_DATA, ...). Exact list captured by `tools/baseline`.
In M1 these become `framework/legacy/legacyProtocol.ts` types with identical names and payloads.

## B4. Operator messaging (today)
| Path | File | Target |
|---|---|---|
| Own shell parent | `WrapperServiceProxy.postDataToWrapper` (1009) | `window.parent`, `'*'` |
| Games Global | `postDataToPublicWrapper` (530) | `'*'`; names `balance_updated` ... `logout` (104-333) |
| GameFlex | `postDataToPublicGFWrapper` (537-539) | parent and grandparent |
| Aristocrat | `postDataToPublicACWrapper` (546-548) | parent and grandparent; `onAppFrameReady` ... `roundEnded` (417-513) |
| Inbound | window `message` listener (61) -> `onPublicWrapperMessage` (73) | routed by `platformStrategy`, no origin check |

The grandparent hop exists because the canvas is nested inside the shell iframe. A React-first page sits one level higher, so the same operator would be reached with one hop. This is the specific change validated by OP tests before US leaves the iframe.

## B5. Socket events (baseline)
Emitted: `updatePlayerPosition`, `PING`. Handled: `teamRatingsUpdated`, `updatePlayerStats`, `FATIGUE_STATUS`, `FATIGUE_CONFIG_UPDATE`, `USER_BALANCE_UPDATE`, `USER_COIN_UPDATE`, `RGS_OP_EVENTS`, `notification`, `SHOW_POPUP`, `UNDER_MAINTENANCE`, `CREDIT_PENDING_UPDATE`, `PONG`, `connect`, `disconnect`.

## B6. Coexistence rule
While US runs in the legacy frame, it owns its own session and socket inside the iframe. New games do not run at the same time in the same page, so there is never more than one session or socket per page. If a lobby later hosts both, session sharing becomes an explicit design item (doc 10).
