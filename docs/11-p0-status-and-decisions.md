# 11. P0 status and decision log

Started 2026-11-23. Phase definition: doc 09 rev 2, P0.

## 1. Delivered
| Item | Location (repo `pbf_ultimatesoccer_fe_v1`) | Status |
|---|---|---|
| Baseline runner with capture and `--check` modes | `tools/baseline/run-all.mjs`, `lib.mjs` | Done, tested (drift detected and exit 1 verified) |
| GraphQL operations capture | `tools/baseline/capture-graphql.mjs` | Done |
| Legacy bridge capture | `tools/baseline/capture-bridge.mjs` | Done |
| Socket events capture | `tools/baseline/capture-socket.mjs` | Done |
| Operator messages capture (static) | `tools/baseline/capture-operator.mjs` | Done |
| Asset URL capture with existence check | `tools/baseline/capture-assets.mjs` | Done |
| Build layout capture | `tools/baseline/capture-build.mjs` | Done (reads existing `build/`) |
| Operator harness for runtime capture (OP1) | `tests/harness/operator.html` | Done, capture and redaction smoke-tested |
| Usage guide | `tools/baseline/README.md` | Done |
| Snapshots | `tools/baseline/snapshots/*.json` | Captured, provisional (see 3) |

Nothing was committed or staged, and no existing file in the repo was modified.

## 2. What the baseline found (new facts)
| Area | Finding |
|---|---|
| GraphQL | 28 shell operations, 62 canvas operations. Shell documents with no caller: `AllBadges`, `FtuNationality`, `FtuUpdate`, `Init`, `Me`, `StartMatch` (the canvas calls its own versions). Canvas document with no caller: `GetAllDetailedDailyRewards` (it is fetched inside `HomeData`) |
| Bridge, shell to canvas | 10 `CanvasMessage` values do not appear anywhere in canvas source, so nothing handles them: `BOOSTER_ADDED`, `PACK_MODAL_CLOSED`, `SHOW_FTUI_PHASE2`, `SHOW_FTUI_PHASE3`, `INITIATE_CANVAS`, `SEND_VAULT_DATA`, `SHOW_BUY_PACK_ANIMATION`, `SHOW_BUY_COIN_ANIMATION`, `CONFIG_DATA`, `Pop_Up_Go_To_Bets_Clicked` |
| Bridge, canvas to shell | 54 posted names. 9 appear nowhere in shell source (posted, never consumed): `ALL_CONTENT`, `CHALLENGES`, `CLOSE_SETTINGS`, `CLOSE_TEAM_EDIT`, `SHOW_HOME`, `SHOW_PACK_MODAL`, `SHOW_PLACED_BET`, `SIMULATION_COMPLETED`, `appHeight` |
| Bridge, call sites | 12 `contentWindow` call sites in the shell, 2 `message` listeners (one per side), 7 canvas `window` globals, 6 `postMessage` calls, all with target `'*'` |
| Socket | Handled: 12 server events + connect/disconnect. Emitted: `PING`, `updatePlayerPosition`, `POPUP_SHOWN` (from the shell through `window.socketService`) |
| Operator | Own shell 54 names, Games Global 21, GameFlex 7 (`game.load.progress` ... `game.handleWalletMessage`), Aristocrat 9. GameFlex and Aristocrat post to `window.parent` and `window.parent.parent`; all senders use `'*'` |
| Assets | 188 URLs across default and World Cup skins at `@1x` and `@0.5x`, sounds included: 0 missing. 13 direct references from code (spines, dynamic folders). 26 atlases not referenced anywhere (`whiteBlast_gold*`, `goldfx*`, `cameraFlashAnim_gold`, `fireWorkAnim_gold`, `shineAnimation`, `homeScreenAssets2` and others) |

These are recorded, not fixed. Fixes go through the approved defect list (Q7).

## 3. Why the snapshots are provisional
- Captured on `feature/PLF-2974-weekend-champions-canvas` at `74a01e53` with 98 uncommitted files (someone's in-progress Weekend Champions work). That work was left untouched.
- The existing `build/` is version `v0.0.2980` from 2026-11-20, which does not match this branch (`v0.0.2975`).

**Action:** on a clean checkout of `dev` (the branch P1 will start from), run:
```bash
npm ci
npm run build:development
node tools/baseline/run-all.mjs
```
and commit `tools/baseline/` with the snapshots in a dedicated PR.

## 4. Still open in P0
| Item | Needs | Owner |
|---|---|---|
| Final snapshots on `dev` | Clean checkout + build (section 3) | FE |
| Runtime operator captures (OP1) per platform strategy | Operator launch URLs for dev/staging per strategy | FE + QA |
| Full US round network log | Running app with a valid dev session; export HAR with tokens stripped | QA |
| Decisions Q1 to Q10 | Leads | See section 5 |
| Test tooling approval (Vitest, React Testing Library, Playwright) | Lead approval | FE lead |
| Device and performance budgets (Q8) | QA + product | QA |

## 5. Decision log
| ID | Question (doc 10) | Decision | Date | By |
|---|---|---|---|---|
| D-001 | Architecture direction | React-first: React app framework, PixiJS rendering engine; per-mount Pixi lifecycle | 2026-11-23 | Approved by user |
| D-002 | Ultimate Soccer | Preserved in legacy iframe, no forced rewrite | 2026-11-23 | Approved by user |
| Q1 | Backend contracts for new games: owner and date | open | | |
| Q2 | New games in this repo or separate | open (recommended: this repo) | | |
| Q3 | Remove US iframe at M4 or keep | open | | |
| Q4 | Approve Vitest, RTL, Playwright | open | | |
| Q5 | Merged error-code table conflicts | open | | |
| Q6 | Shell receives `beToken` from legacy canvas or authenticates separately | open | | |
| Q7 | Approved defect fixes and timing (D1, D2, D6, D7, plus the 10 unhandled and 9 unconsumed bridge messages) | open | | |
| Q8 | Device and performance budgets | open | | |
| Q9 | Acca Crash shared or per-user rounds | open | | |
| Q10 | Operators per new game at launch | open | | |
