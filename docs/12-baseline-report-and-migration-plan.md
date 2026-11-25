# 12. Baseline report and React-first migration plan

Date: 2026-11-23. Status: for review. No implementation started.

## 0. Working rules applied
- The existing PBF project (`C:\Users\venka\PBF\pbf_ultimatesoccer_fe_v1\pbf_ultimatesoccer_fe_v1`) is not changed. Everything new lives in `C:\Users\venka\PBF\pbf-game-framework`.
- Credentials from the git configuration were not printed; the remote URL was not changed.
- The four ponytail skills are intact (moved, unchanged) in `pbf-game-framework/.claude/skills/`.
- Smallest complete change: only what this report needs was built.

## 1. Fresh project folder
```
pbf-game-framework/
  .claude/skills/        ponytail, ponytail-review, ponytail-audit, ponytail-debt (MIT, SOURCE.md)
  docs/                  01 to 12 (moved from C:\Users\venka\PBF\pbf-framework-docs)
  tools/baseline/        capture scripts; read any PBF checkout via PBF_ROOT, write only here
  tools/harness/         operator.html (OP1 runtime capture)
  baseline/
    dev-a84a3a11/        final static snapshots + build snapshot (origin/dev)
    provisional-feature-branch/  earlier snapshots from the feature branch (superseded)
    logs/                npm ci and build logs
    screenshots/         captured screenshots
  reference/pbf-dev-a84a3a11/   read-only export of origin/dev (git archive), with node_modules
```

### What was reverted in the PBF project
| Item I had added | Action | Result |
|---|---|---|
| `tools/baseline/` | Copied out (verified identical), removed | Gone from PBF |
| `tests/harness/` | Moved out | Gone from PBF |
| `.claude/skills/ponytail*` (4) | Moved out | Gone; `pbf-canvas-framework` untouched |
| Worktree `../pbf-dev-baseline` | `git worktree remove` + `prune` | Gone; only the main worktree remains |
PBF `git status` is back to its original 97 entries (the in-progress Weekend Champions work), none of them mine.

## 2. Latest dev commit and version
| | Value |
|---|---|
| Fetch | **Blocked by authentication** (`git fetch origin dev` needs a password; non-interactive check failed with "unable to get password"). Not retried. The stuck background fetch was stopped |
| Commit used | `origin/dev` = `a84a3a11` (2026-11-14, "CI: Increment version to v0.0.2980") |
| Version | `v0.0.2980` |
| Freshness | **Possibly outdated**: last local fetch of `origin/dev` was on or before 2026-11-14. Re-run the baseline after an authenticated fetch |

## 3. Build status (reference copy of origin/dev)
| Step | Result |
|---|---|
| `npm ci` | OK, 963 packages, 1 to 2 min |
| `npm run build:development` | OK (tsc clean, vite built in 20.6 s) |
| `npm run build` (production) | OK (tsc clean, vite built in 17.8 s) |
| Build errors | None |
| Build warnings | Canvas entry chunk `index-canvas` is 2,800 kB (701 kB gzip), above Vite's 500 kB limit; main app chunks are under 310 kB |
| Deprecated packages (npm) | `@babel/plugin-proposal-class-properties`, `@babel/plugin-proposal-object-rest-spread`, `@graphql-tools/prisma-loader`, `eslint@9.39.5` (end of support), `glob@7`, `inflight`, `node-domexception`, `tsconfck` |
| `npm audit` | Not run (install used `--no-audit`) |
| Runtime console (dev server) | Pixi v7 `settings.SCALE_MODE` and `settings.GC_MODE` deprecations (`gameApp.ts:76-77`); `Container.name` removed in v8, use `label` (`UIUtilService.ts:140`); browser warning that the canvas iframe sandbox (`allow-scripts` + `allow-same-origin`) can escape its sandbox |
| Baseline check | `run-all --check` on the reference copy equals the worktree snapshots (graphql, bridge, socket, operator, assets) |

## 4. Screenshots captured
| File | What |
|---|---|
| `baseline/screenshots/01-dev-a84a3a11-mobile-loader-no-session.jpg` | Mobile 375x812, app loads to the canvas loader and stops |

**Why only one:** the game needs an operator launch URL with a session token to get past the loader (the token is read from the parent URL). I did not create, guess or reuse credentials. To capture the full set (home, team, match making, simulation, result, store, challenges, divisions, drawers and modals), please provide a dev launch URL, or run the app yourself with the harness (`tools/harness/operator.html`) and I will capture through the browser pane.

## 5. Current React / Pixi screen breakdown (origin/dev)

### Pixi (inside the canvas iframe)
| Screen / route (`SCREENVIEWS`) | Main files (lines) | Nature |
|---|---|---|
| `HOME` | `HomeScreenView.ts` (415) + bottom bar `AppBottomBar.ts` (1151) | UI screen |
| `HUB_VIEW` | `HubScreenView.ts`, `HubTabPanel.ts` (962) | UI screen |
| `TEAM_VIEW` (team formation) | `TeamFormationView.ts` (4183), `AllPlayersComp.ts` (1276), `PlayerDetailsComp.ts` (946), `SwapPlayerComp.ts` (972) | Mixed: pitch is visual, lists and details are UI |
| `MATCH_MAKING` | `MatchMakingView.ts`, `MatchMakingAnimComp` | Animation |
| `MATCH_SIMULATION` | `MatchSimulationView.ts`, `SimulatorComp.ts` (1680) | Gameplay |
| `MATCH_RESULT` | `MatchResultView.ts` (1282), `MyBetsBetItem.ts` (896) | Mixed: result UI + celebration |
| `PENALTY` | `PenaltyView.ts` (632) | Gameplay |
| `CHALLENGE_REWARD_WHEEL` (vault wheel) | `ChallengeRewardVaultView.ts` (350) | Gameplay / animation |
| `PACK_OPENING` | `PackOpeningView.ts` (2650), `PackOpeningViewEOS.ts` (2889), `RewardPackCelebrationComp.ts` (3809), `RewardCelebrationComp.ts` (2152) | Animation (Spine) |
| `DIVISIONS_VIEW` | `DivisionScreenView.ts`, division comps | UI screen |
| `CHALLENGES` | `ChallengesView.ts` (557) | UI screen |
| `STORE` | `StoreView.ts` (494) | UI screen |
| `SPLASH_SCREEN` | `SplashScreen.ts` (491) | UI screen |
| `FTUE_BANNER`, `FTUE_STAR_PLAYER_PACK`, `FTUE_STAR_PLAYER_SWAP` | `FtueBannerView.ts` (437), `PackOpeningScreenFtueV2.ts` (362), `FtueStarPlayerSwapView.ts` (197) | UI + animation |
| Always-on chrome | Preloader, top bar, bottom bar, error/network/modal popups, daily rewards, settings popup, quick-sold popup | UI |
| `MYBETS`, `WALLET` | Route ids only; the canvas does nothing and React renders them | n/a |

### React (shell)
| Area | Files (lines) |
|---|---|
| Routes | `/home` (hosts the canvas iframe, `Home.tsx` 494), `/playcheck` (`Playcheck.tsx` 480) |
| Overlay pages | My Bets (`Bets.tsx` 264, `BetSlip.tsx` 831), Wallet (banking iframe) |
| Drawers | Bet panel (`StakePannelOptionsDrawer.tsx` 512, `StakePannelInput.tsx` 1853, 13 market components), Settings (428), Leaderboard (329), League (426), Team edit V2 (705), Vault trophy (53); Team edit V1 (454) unused |
| Modals | Game rules (490), Stake info, Place bet / start match (259), Min/max stake, Bet info, League info, Vault intro, Error, Canvas popup |

**Split today:** most navigable screens are Pixi; React handles betting, history, settings, leaderboards and team editing. The same domain is split across both (team formation in Pixi, team edit in React; bet slip rendered in React and again in Pixi on the result screen).

## 6. Reusable pieces
| Kind | Item (origin) | Reuse in the new framework |
|---|---|---|
| React components | `Drawer`, `Modal`, `Button`, `Typography`, `Tab`, `Accordion`, `NumbersKeypad`, `TextFeild`, `Loader`, `MinMaxStakeModal`, `ErrorPopUpModal` | Copy into `framework/ui` with the generic parts only |
| Services | Apollo client (`src/apollo/client.ts`), i18n (`src/i18n`), analytics (`src/service/firebaseAnalytics.ts`), event bus (`src/util/eventHandler.ts`), core fields of `sessionHelper` | Basis for `framework/services` |
| Canvas services | `SocketService.ts` (heartbeat, reconnect), `SoundServiceProxy.ts` (Howler), `AssetLoader.ts` path rules, `getToken` / `Init` flow in `MessageServiceProxy.ts` | Port the logic into framework services (no canvas dependency) |
| Operator wrappers | `WrapperServiceProxy.ts`: own shell, Games Global (21 messages), GameFlex (7), Aristocrat (9) | Port into `framework/services/wrappers`; validate with OP tests |
| Gameplay scene candidates | `SimulatorComp` (match sim), `PackOpeningView` + `RewardCelebrationComp` (Spine), `PenaltyView`, vault wheel, `MatchMakingAnimComp`, `PlayerCardCompWrapper` (card render and reveal) | Wrap as `PixiScene<P,E>` when Ultimate Soccer migrates; reuse rendering code for new games |
| Pixi wrappers | `corelib/pixiwrapper/*` (only classes without game imports) | Copy the clean ones into `framework/pixi/view` |
| Assets | PBF atlases, Spine, sounds, fonts, card tiers in `canvas/assets` | Shared pack for new games |

Because the framework is now a separate project, "reuse" means **copying** the generic parts into it, not importing from the PBF repo.

## 7. Major architectural findings
1. **Most UI is drawn in Pixi**, including list-heavy screens (store, challenges, divisions, team lists). This is the main reason the canvas chunk is 2.8 MB and why layout code (`UIUtilService.ts`, 2000+ lines) exists.
2. **Domains are split across the iframe** (team formation vs team edit, bet slip in two renderers), so many features need bridge messages in both directions.
3. **Bridge drift**: 10 shell-to-canvas messages are handled nowhere, 9 canvas-to-shell messages are consumed nowhere (doc 11).
4. **No session path without an operator token**: local runs stop at the loader. A dev launch flow (or harness with a dev token) is needed for screenshots and testing.
5. **Security**: every `postMessage` uses `'*'`; `beToken` crosses the iframe; iframe sandbox can be escaped (browser warning); hard-coded fallback token in source (doc 10).
6. **Pixi v8 with v7 leftovers** (deprecated settings, `Container.name`).
7. **No tests**; deprecated tooling packages; a 2.8 MB single canvas chunk.

## 8. React-first migration plan (with the separate-project decision)

### 8.1 Decision to record
**D-003:** The React-first framework and new games are built in a separate project (`pbf-game-framework`). The current PBF project is not changed. This answers Q2 and changes docs 04 and 09: the "re-host Ultimate Soccer in M1" step moves out of scope until you decide otherwise.

### 8.2 Tracks
| Track | Scope | When |
|---|---|---|
| T: new framework | React 18 + Vite + TS app in `pbf-game-framework`, `framework/{ui,state,services,pixi,contract}`, new games | Starts after your review |
| L: Ultimate Soccer | Untouched. Baseline kept current (re-run after authenticated fetch). Later options: (a) leave as is, (b) host it inside the new framework via `LegacyCanvasFrame`, (c) migrate screens. Your call later | Not now |

### 8.3 Per-screen target for a future Ultimate Soccer migration (for planning only)
| Becomes React | Becomes a Pixi scene | Shared |
|---|---|---|
| Home, hub, store, challenges, divisions, splash, FTUE banners, team lists and player details, settings, daily rewards, popups, top and bottom bars | Match simulation, match-making animation, pack opening and reward celebrations (Spine), vault wheel, penalty, win celebration, pitch view in team formation | Player card render (scene for reveals, React image for lists) |

### 8.4 Order for Track T
1. Scaffold the framework project (Vite, React 18.3.1, TypeScript, lint, Prettier; npm, matching PBF conventions).
2. `framework/pixi`: `PixiStage` + scene contract + one spike scene, validated with V1, V6, V7.
3. `framework/services`: api, session, socket, round, bet, audio, wrappers, errors (mocked transports).
4. `framework/ui` from the reusable React components.
5. First new game when its backend contract exists (Q1).

## 9. Proposed first implementation task
**Scaffold the framework project and build the `PixiStage` spike**, inside `pbf-game-framework` only:
- `npm create vite` equivalent setup by hand: React 18.3.1, TypeScript, Vite 5 (same majors as PBF), ESLint and Prettier copied from PBF config.
- `src/framework/pixi/scene.ts` (contract), `PixiStage.tsx` (per-mount Application, resize, pause, context loss via `onError`, full teardown).
- One spike scene: a Higher or Lower card reveal using PBF card-tier art copied from the reference assets, driven by synthetic props, with a typed `REVEAL_DONE` event.
- A demo page that mounts and unmounts the stage repeatedly.
- Checks: V1 (50 mount/unmount, no context leak), V6 (scene disposes everything), V7 (stage textures unloaded) as a small automated script plus a manual iOS check later.
- Out of scope: backend, operators, Ultimate Soccer.
Size: small. It proves the most uncertain part of the architecture (Pixi lifecycle in React) before anything depends on it.

## 10. Skipped or carrying risk
- **Outdated baseline risk**: `origin/dev` could not be fetched (authentication). Snapshots are from `a84a3a11` (2026-11-14). Re-run after you fetch: `PBF_ROOT=<fresh export> node tools/baseline/run-all.mjs --check --out baseline/dev-a84a3a11`.
- **Screenshots**: only the loader; needs a dev launch URL or your session.
- **Operator runtime captures (OP1)** and the **full round network log** not done (need operator launch URLs / a session).
- **`npm audit`** not run.
- **Docs 04 and 09** still describe the same-repo layout; they need a small revision for D-003 after you approve it.
- **Disk**: `reference/pbf-dev-a84a3a11` includes `node_modules` (632 MB in total); the builds ran in the removed worktree, so their logs are kept in `baseline/logs` but no build output remains. Delete the reference when no longer needed.
- **Session-root launch config**: `C:\Users\venka\PBF\.claude\launch.json` was added for the browser preview (outside both projects).
- **AGENTS.md symlinks** were not recreated in the reference export (Windows tar limitation); harmless for reading.
