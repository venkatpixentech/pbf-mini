# 07. Backend integration and round lifecycle

Rule: every contract below is preserved exactly. The framework changes who calls it, not what is called.

## 1. Transports
| Transport | File | Base URL | Auth | Timeout / retry |
|---|---|---|---|---|
| Shell Apollo | `src/apollo/client.ts` | `VITE_API_URL + /graphql`, `credentials: 'include'` | `Authorization: Bearer <beToken>` (empty if unset) | none; `no-cache`, `errorPolicy: all` for queries only |
| Canvas graphql-request | `src/canvas/corelib/models/services/graphqlClient/graphqlClientService.ts` | `APIUrls.apiUrl + /graphql` | Bearer via request middleware | none; error middleware defined but not wired |
| Socket.io | `src/canvas/corelib/models/services/socket/SocketService.ts` | `APIUrls.socketUrl` | `auth: { token: beToken }` | 5 reconnects, max 10 s; PING every 5 s, PONG timeout 3 s |
| Launch (demo fallback) | `MessageServiceProxy.getToken` | `externalUrl + /games/launch` | none | none |
| Translations | `gameApp.ts:369, 443`; `src/i18n/i18nHelper.ts:21` | `apiUrl + /translations/{lng}` | none / Bearer | none |
| Axios `HTTPService.ts` | no callers | | | legacy, do not migrate |

URLs come from env (`VITE_API_URL`, `VITE_SOCKET_URL`, `VITE_EXTERNAL_URL`) and are pushed to the canvas by the `URLS` bridge message.

## 2. Token lifecycle (current)
1. Operator token read from the parent window URL hash (`GameUtilClass.getQueryParamsFromParent`, `GameUtilClass.ts:431`); standalone mode reads the iframe URL.
2. If missing: demo launch call returns a token. No production gate today.
3. `Init(token)` returns InitResponse including `beToken`. The caller also passes `language`, `currency`, `isDebugBuild`, which are not declared in `src/graphql/canvas/Init.gql`.
4. `beToken` set on the canvas GraphQL client and socket.
5. Whole InitResponse, including `beToken`, posted to the shell with `postMessage(..., '*')` (`WrapperServiceProxy.ts:781-788, 1009`); shell stores it in memory (`sessionHelper.onSignIn`).
6. No refresh, no expiry handling. Code 2300 (session expired) only shows a message.
7. Not stored in local or session storage; not logged.

Framework handling: `SessionService` owns steps 1 to 4 with identical calls. Steps 5 and 6 are security items (doc 10 S1 to S5) that need explicit approval before any behaviour change.

## 3. Init response: core vs game
Core fields (every game): identity and platform ids, `beToken`, `balance`, `pbfCoin`, `currency`, `currencyLang`, `currencyUseGrouping`, `currencyDecimals`, `minBet`, `maxBet`, `maxPayOut`, `language`, `countryCode`, `lobbyUrl`, `bankingUrl`, `platformStrategy`, `gameAlias`, `isUnderMaintenance`, `underMaintenanceTitle`, `creditPending`, `blockMatchOnPendingCredit`, `notifyOnCreditFailure`, `useAnalytics`, `useCheat`, `showRtpGameRules`, `showOpenCloseBalance`, `showWinLoss`.
Game fields (Ultimate Soccer): badge, kit and kit colours, team name config, `isFTU`, `extraData` (FTUE, quick swap), rewards and division fields, `startMatchBtn*`, `isWorldCupMode`, tutorial and CTA flags.
Null-safe defaults required: `currencyDecimals` (derive from currency), `lobbyUrl`/`bankingUrl` (hide buttons), `kitColorBorders`, `eosRewards`, `operatorLogos`, `lastMatchDetails`.

## 4. Round lifecycle (Ultimate Soccer, verified)
| # | Step | Operation (`.gql`) | Caller | Side | State after |
|---|---|---|---|---|---|
| 1 | Show odds | `Odds` (`main/stakePannelOddsOptionsList.gql`) | `Home.tsx` `showBet` | shell | `sessionHelper.updateOddDetails` |
| 2 | Quick stakes | `GetQuickBets` (`main/getQuickBets.gql`) | `NumbersKeypad.tsx:82` | shell | keypad presets |
| 3 | Add/update/remove slip | `AddUpdateBet`, `RemoveBetFromSlip` | `useHandleAddUpdateOdds.tsx` | shell | store odds list |
| 4 | Place bet | `PlaceBet` (`main/placeStake.gql`) then `CurrentBetSlip` | `StakePannelInput.tsx handlePlaceBet` | shell | `BET_PLACE_RESPONSE` to canvas; pot data |
| 5 | Start match | `LastMatchDetails`, `CurrentBetSlip`, `StartMatch` | `ScreenContainer.ts:913-924`, `MessageServiceProxy.startMatchSim` | canvas | `SHOW_SIMULATION` with server events; `UpdateUserExtraData` |
| 6 | Simulation | none (server data replay) | `SimulatorComp.showSimulation` | canvas | `appModel.simulationData` |
| 7 | End and result | `EndMatch`, `GetPostMatchChallengeUpdates` (not awaited), `MatchResult` | `gameApp.onSimulationCompleted` (1035) | canvas | `storeSimResult`, `SHOW_MATCH_RESULT` |
| 8 | Credit | none on client; socket `USER_BALANCE_UPDATE` | `MessageServiceProxy.ts:106-118` | canvas | balance, shell `UPDATE_BALANCE` |
| 9 | Credit pending | Init flags + socket `CREDIT_PENDING_UPDATE` | `GameAppScreen.ts:1045`, `HubScreenView.ts:53`, `HomeScreenView.ts:84`, `TeamFormationView.ts:878` | canvas | next match blocked |
| 10 | Void / refund | socket `SHOW_POPUP` (`VOID_BET`, `CREDIT_DELAYED`); history `myBets` shows refund states | `Home.tsx:211`, `CanvasPopUpModal.tsx:75`, `BetSlip.tsx:177` | both | popup, history |
| 11 | Resume | `HomeData.lastMatchDetails.matchStatus` | `gameApp.resumeNormalUser`, `checkToResumeLastMatchState` | canvas | `SELECTING_ODDS`/`PLACE_BET` -> bet panel; `MATCH_STARTED` -> result path |

Duplicate-submit protection exists for add/remove and place bet (shell flags). `StartMatch` has no in-flight guard and its retries re-issue the mutation (risk R4, doc 10).

## 5. Error handling (current, kept)
| Source | Handling |
|---|---|
| Canvas GraphQL error | `showErrorPopUp` (`MessageServiceProxy.ts:1460`) maps `extensions.code`; 2420/2436/2449 -> init error; 60000 -> maintenance; else server error popup; suppressed while disconnected |
| Shell GraphQL error | `ErrorPopUpModal.tsx:26` maps with a different table; 2300 and 60000 only hide the footer button |
| Network | socket disconnect or PONG timeout -> popup after 4 s (`GameAppScreen.ts:1389`) |
| Maintenance | Init flag, socket `UNDER_MAINTENANCE`, or code 60000 |
| Validation | none at runtime (codegen types only) |

Framework target: one `ErrorMapper` table (merge after product resolves conflicts), `ErrorService` actions, `ResponseGuards` on critical responses, wired error middleware.

## 6. New games: backend contract needed
None of these exist; they must be specified and owned by the backend team before P5 of the roadmap (doc 09, revision 2). New games call them through the single Apollo client in `framework/services/api`:
| Need | AC | HL | LMS |
|---|---|---|---|
| Round open / schedule | yes (shared rounds) | yes | per-user run |
| Bet | yes (2 panels) | yes (market + stake) | yes (stake + pick) |
| Cash out | yes, timing-critical | yes | yes |
| Auto cash out | yes | no | no |
| Round result | crash point, goals, scorers | next card | match results |
| Push events | tick, crowd/feed, crash | feed, leaderboard | none |
| Maths spec owner | from prototype RTP 97% | from prototype RTP 0.96 | from prototype ladder 95% |

Reuse expected: `Init` core subset, wallet socket events, error codes, wrapper messages.
