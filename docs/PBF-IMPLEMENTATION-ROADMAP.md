# PBF implementation roadmap

How the framework is stabilised: nine portions, each inspected, scoped, implemented, validated, documented and
then **FROZEN**. A frozen portion is protected from later work (see "Frozen portion policy" below).

Last updated: 2026-11-25. Nothing has been implemented under this roadmap yet; this revision records the
baseline, the portion boundaries and the overlaps to resolve.

Allowed statuses: `PENDING`, `IN_PROGRESS`, `VALIDATION`, `FROZEN`, `BLOCKED`.

## Summary

| # | Portion | Status | Proposed freeze order | Depends on (imports today) |
|---|---|---|---|---|
| 1 | Foundation and game isolation | PENDING | 1st | none (type-only references to 2, 4, 6: overlap O4) |
| 2 | Boot and loading system | PENDING | 4th | 1, 3 (`AppShell`), 6 (i18n, `assetUrl`) |
| 3 | Shared UI and responsive layout | PENDING | 3rd | 1 (`money`), 6 (`useCoreT`) |
| 4 | PixiJS rendering engine | PENDING | 5th | 2 (`startup`, `loadQueue`, `registerAsset`), 6 (`translate`, `onLanguageChange`) |
| 5 | Round lifecycle and server timing | PENDING | 6th | none in core |
| 6 | Internationalization and asset management | PENDING | 2nd | 1 (`setMoneyLocale`, `ApiError`) |
| 7 | Game-specific architecture and backend integrations | PENDING | 7th | 1 to 6 |
| 8 | Testing and developer experience | PENDING | 8th | 1 to 7 |
| 9 | Production readiness | PENDING | 9th | everything |

The portion numbers stay as identifiers. The **freeze order** differs from the numbering because of the real
import graph: a portion should only freeze after every portion it imports from is frozen. Otherwise a later
portion that changes an interface would force a frozen one to reopen (see "Dependency boundaries").

## Baseline (2026-11-25)

Measured before any portion work, on the uncommitted working tree.

| Check | Result |
|---|---|
| `npm run typecheck` | Pass |
| `npm run lint` | **Fail**: 1 Prettier error, `src/games/accacrash/api/mockServer.check.ts:124` |
| `npm run check` | **Fail**: stops at `src/games/accacrash/api/mockServer.check.ts` (unhandled `ApiError: ROUND_CLOSED`); the checks after it pass when run individually |
| `src/core/round/round.check.ts` | Passes, but is not listed in the `check` script, so `npm run check` never runs it |
| `npm run test:e2e` | Last recorded run passed (16:14), before the in-progress Acca Crash API edits; not re-run |
| Git | One commit (`initial commit`); 92 files changed and 30 untracked on top of it, uncommitted |

Baseline issues that affect freezing:

- **B1.** Acca Crash mock API rework is in progress (`api/mockServer.ts`, `api/mockServer.check.ts`,
  `api/types.ts`, `AccaCrashScreen.tsx`) and breaks `npm run check`, which every portion uses as a gate.
- **B2.** No commit marks the current state. A freeze recorded only in this document cannot detect later edits to
  frozen files. Recommendation: commit a baseline before each freeze and record the commit here (commits are
  made by the team, not during portion work).
- **B3.** `src/core/game/defineGame.ts`, `src/core/i18n/*.ts` and `src/games/accacrash/i18n/en.ts` link to
  `docs/08-I18N-TRANSLATIONS.md`, which does not exist. `docs/00-PBF-OVERVIEW.md` still says translations
  are not implemented and browser tests are outside the repo; both are now out of date.
- **B4.** `../pbf-game-builds` still holds old hyphenated builds (`acca-crash`, `higher-lower`,
  `last-man-standing`, `ultimate-soccer`) next to the current ones. Outside the repo; not touched.

## Frozen portion policy

Once a portion is FROZEN:

- Its source files are not modified, refactored, renamed, moved or replaced.
- Its public interfaces do not change, and no new dependency is introduced into it.

If later work needs a change in a frozen portion: stop, explain the dependency, list affected games and
portions, propose the smallest change, state the regression risks, and wait for explicit approval. Only
critical defects or unavoidable architectural dependencies justify reopening. Every reopening is recorded in
the portion's "Reopening history".

**Proposed exceptions (need approval before the first freeze):**

- **E1. Append-only registries.** Adding an entry is not a modification of the owning portion, as long as no
  existing entry changes: a new self-check appended to the `check` script in `package.json`, a new rule
  appended to `scripts/check-games.mjs`, a new key appended to `src/core/i18n/en.ts`.
- **E2. Documentation accuracy.** A frozen portion's doc may be corrected when it is wrong about frozen
  behaviour. It may not describe new behaviour.

Backend rule: each game owns its backend integration. No universal backend client or betting protocol. Shared
technical utilities (clock sync, duplicate-action guard, mock transport) are allowed; contracts, socket events,
betting rules, game state and settlement stay in `src/games/<id>`.

## Dependency boundaries

Actual imports between core areas today (`A -> B`: A imports B):

```
boot/GameBoot      -> game/defineGame (types), i18n, i18n/react, services/apiError, ui/AppShell,
                      boot/launchParams, boot/loadQueue, boot/startup,
                      pixi/preload (dynamic), pixi/warmup (dynamic)
game/defineGame    -> boot/launchParams (type), i18n (type), pixi/scene (type)
pixi/PixiStage     -> boot/startup, i18n, pixi/buildView, pixi/stageAssets
pixi/buildView     -> i18n, pixi/theme
pixi/preload       -> boot/assetUrl, boot/loadQueue
pixi/stageAssets   -> pixi/preload
i18n/index         -> services/money
ui/GameHeader      -> i18n/react, services/money
ui/StakeChips      -> i18n/react, services/money
hooks/useApiMessage -> i18n, i18n/react, services/apiError
hooks/useRoundEngine -> services/RoundEngine
round/react        -> round/serverClock
services/mockTransport -> services/apiError
```

Core never imports a game (enforced by `check:games` rule 8). Games import core freely; Last Man Standing
(`renderer: 'dom'`) imports no `core/pixi` or `core/round`.

### Overlaps to resolve

Each needs a decision before the portion that owns it is frozen. "Proposed" is the recommendation.

| Id | Overlap | Portions | Proposed resolution |
|---|---|---|---|
| O1 | `vite.config.ts` holds three portions' code: game selection, aliases and output folder (1), `startupHints` modulepreload and font preload (2), `gameAssets` copy and `assetVersions` hashes (6). Freezing 1 would freeze 2's and 6's build code. | 1, 2, 6 | During Portion 1, move `startupHints` and `gameAssets`/`assetVersions` into their own files under `scripts/vite/` with identical behaviour, so each file has one owner. Fallback: function-level ownership inside one file. |
| O2 | `scripts/check-games.mjs` rules belong to different portions: 0, 1, 2, 4, 8 (isolation: 1), 3 (check wired: 8), 5, 6 (Pixi: 4), 7 (GameLayout: 3), 9 (translations: 6). | 1, 3, 4, 6, 8 | Owned by 1 as a runner; each rule owned by its portion; new rules append-only (E1). |
| O3 | `package.json` `check` script is a registry every portion adds to; `round.check.ts` is missing from it. | all | Owned by 8; append-only (E1). `round.check.ts` is added in Portion 5. |
| O4 | `GameDefinition` (1) references `LaunchParams` (2), `StageAsset` (4) and `DictionaryLoader` (6). Freezing the contract freezes those three types too. | 1, 2, 4, 6 | Treat the three types as part of Portion 1's frozen contract ("pinned types"), while their files stay owned by 2, 4 and 6. |
| O5 | Boot and Pixi import each other: `GameBoot` dynamically imports `pixi/preload` and `pixi/warmup`; `PixiStage` imports `boot/startup`; `pixi/preload` imports `boot/loadQueue` and `boot/assetUrl`. | 2, 4 | Assign `pixi/preload.ts` and `pixi/warmup.ts` to Portion 2 (they exist for the boot sequence and are only loaded by it). Then 4 depends on 2, never the reverse. |
| O6 | `boot/assetUrl.ts` is asset management in the boot folder. | 2, 6 | Owned by 6, no move. |
| O7 | Two round mechanisms used together by Higher or Lower and Acca Crash: `services/RoundEngine.ts` + `hooks/useRoundEngine.ts` (client timers that auto-advance phases) and `core/round/*` (server clock: "nothing a browser timer does can open, close or settle a round"). Their responsibilities are not written down. | 5, 7 | Both owned by 5. First step of Portion 5: define the boundary (likely RoundEngine = client presentation sequencing only, `round/*` = server-authoritative timing). Decision for approval in Portion 5, not now. |
| O8 | `services/services.check.ts` tests both `money` (1) and `RoundEngine` (5). | 1, 5 | During Portion 1, keep the money assertions there and move the RoundEngine assertions to a Portion 5 check, unchanged. Fallback: co-owned file. |
| O9 | Mock support lives in three places: `services/mockTransport.ts` (incl. `mockInitError`), `round/mockClock.ts`, and each game's `api/mockServer.ts`. | 5, 7 | `mockTransport.ts`: 7 (shared mock utility, never imported by a real backend). `mockClock.ts`: 5 (exercises clock sync). Game mocks: each game (7). |
| O10 | `services/apiError.ts` defines `SessionErrorCode` (`MAINTENANCE`, `SESSION_EXPIRED`, `SESSION_INVALID`), a backend vocabulary in core, used by the boot. | 1, 2, 7 | Owned by 1 as a primitive. Only valid if these codes are PBF platform facts (doc 09); confirm the source before freezing, do not extend it with invented codes. |
| O11 | `hooks/useApiMessage.ts` turns game error codes into translated text. | 6, 7 | Owned by 6 (it is translation of codes; it has no game rules). |
| O12 | `src/styles.css` holds `@font-face` (6), tokens and app frame and layout CSS (3), boot loader CSS (2). Tokens are also copied by hand into `pixi/theme.ts` (4) and the inline loader in `index.html` (2). | 2, 3, 4, 6 | Owned by 3. `@font-face` block owned by 6. Token duplication recorded as a known limitation; any token change must update all three. |
| O13 | Two asset pipelines: fonts and `desktopBg.png` are bundled by Vite from `src/core/assets` (hashed file names); everything else is copied from `public/assets` with `?v=` hashes. Doc 02 still describes fonts in `public`. | 6 | Decide and document one rule in Portion 6. |
| O14 | Shared common-asset path (`COMMON_BASE`, doc 02 gap) is a production concern (9) but changes `assetUrl` and the asset build plugin (6). | 6, 9 | Decide the mechanism in Portion 6 (even if off by default), so Portion 9 only configures it. Otherwise 9 must reopen 6. |
| O15 | `GameBoot` renders `ui/AppShell` (3), so with numeric freeze order Boot (2) would freeze before the frame it uses. | 2, 3 | Freeze order 3 before 2. |
| O16 | `core/i18n/en.ts` holds strings for boot (2), UI (3) and session errors (7). | 2, 3, 6, 7 | Owned by 6; new keys append-only (E1). |
| O17 | Testing (8) cannot own all tests: every portion must pass its own tests before it freezes. | all | Each portion owns its self-checks and e2e specs (mapping below). Portion 8 owns the harness: `playwright.config.ts`, `scripts/serve-builds.mjs`, `tests/e2e/helpers.ts`, `tests/tsconfig.json`, `scripts/new-game.mjs`, lint and format config. |
| O18 | `vite.config.ts` `startupHints` reads each game's `index.ts` with regexes (`title: '...'`, `renderer: 'pixi'`). Reformatting a game definition (double quotes, a constant) silently changes the page title and preloads. | 1, 2, 7 | Record as a regression risk of the contract; add a `check:games` rule in Portion 2 if needed. |
| O19 | `round/actionGuard.ts` (duplicate-click protection, retry with the same request id) is backend-facing. | 5, 7 | Owned by 5 as a generic utility; it defines no endpoint or payload. Whether a given backend honours the request id is a game (7) fact, not assumed in core. |

### e2e spec ownership

| Spec | Owner |
|---|---|
| `tests/e2e/failures.spec.ts` (asset, font, screen-code, renderer-chunk and session failures) | 2 |
| `tests/e2e/layout.spec.ts` (sizes, operator element) | 3 |
| `tests/e2e/resize.spec.ts` (one canvas, no listener leaks) | 4 |
| `tests/e2e/i18n.spec.ts` (fallback, launch language, live switch, Pixi relabel) | 6 |
| `tests/e2e/games.spec.ts` (each game loads from a subfolder, a click changes state) | 7 |
| `tests/e2e/helpers.ts` | 8 |

---

## Portion 1: Foundation and game isolation

- **Status:** PENDING
- **Scope:** The game contract and the one-game-per-build model: how a game is declared, selected, built and
  kept isolated from other games and from core. Shared primitives every portion uses (money, API error type).
- **Files owned:** `src/main.tsx`, `src/game.d.ts`, `src/core/game/defineGame.ts`,
  `src/core/services/money.ts`, `src/core/services/apiError.ts`, `src/core/services/services.check.ts`
  (money part, O8), `vite.config.ts` (game selection, aliases, output folder, O1), `scripts/dev.mjs`,
  `scripts/build.mjs`, `scripts/check-games.mjs` (runner and rules 0, 1, 2, 4, 8; O2), `tsconfig.json`,
  `package.json` dependencies, `docs/01-ARCHITECTURE.md`.
- **Public interfaces:** `defineGame`, `GameDefinition`, `GameScreenProps`, `CoreInit`; pinned types
  `LaunchParams`, `StageAsset`, `DictionaryLoader` (O4); module aliases `@game`, `core/...`, `games/...`;
  `GAME_ID`, `BUILD_DIR`; `npm run dev -- <id>`, `npm run build [-- <id> ...]`; `ApiError`,
  `SessionErrorCode`; `roundMoney`, `compareMoney`, `formatMoney`, `setMoneyLocale`.
- **Dependencies:** none at runtime.
- **Tests executed:** none yet under this roadmap (baseline above).
- **Acceptance criteria (draft, finalised in Step 2):**
  - `typecheck`, `lint` and `check:games` pass; money and services self-checks pass.
  - Every game builds alone into `../pbf-game-builds/<id>`; a build contains no other game's code or assets.
  - Core imports no game; no game imports another; a `dom` game's build never executes Pixi.
  - O1, O2, O4, O8, O10, O18 resolved and recorded here.
  - The contract and build model documented in `docs/01-ARCHITECTURE.md`.
- **Known limitations:** `startupHints` regex coupling to game `index.ts` formatting (O18).
- **Freeze date:** not frozen.
- **Reopening history:** none.

## Portion 2: Boot and loading system

- **Status:** PENDING
- **Scope:** From HTML to playable: inline loader, launch parameters, parallel startup of session, screen
  code, assets and renderer, load queue, startup marks, boot error screens, startup hints in the build.
- **Files owned:** `index.html`, `src/core/boot/GameBoot.tsx`, `src/core/boot/launchParams.ts`,
  `src/core/boot/loadQueue.ts`, `src/core/boot/loadQueue.check.ts`, `src/core/boot/startup.ts`,
  `src/core/pixi/preload.ts` and `src/core/pixi/warmup.ts` (O5), `startupHints` build plugin (O1),
  boot loader CSS in `src/styles.css` (O12), `docs/05-LOADING-PERFORMANCE.md`, `tests/e2e/failures.spec.ts`.
- **Public interfaces:** `GameBoot`; `readLaunchParams`; `runQueue`, `withTimeout`, `LoadError`,
  `QueueOptions`; `markStartup`, `reportCriticalScene`, `onCriticalScene`, `StartupStage`;
  `preloadStageAssets`, `registerAsset`, `warmRenderer`; the `pbf:<stage>` performance marks.
- **Dependencies:** 1; 3 (`AppShell`); 6 (`initI18n`, `setLanguage`, `useCoreT`, `assetUrl`).
- **Tests executed:** none yet.
- **Acceptance criteria (draft):** `loadQueue.check` passes; `failures.spec` passes; all three games reach
  `pbf:playable` from a subfolder build with a clean console; loading times not worse than doc 05 under the
  same throttling; a `dom` game requests no Pixi file.
- **Known limitations:** loading measured on desktop Chrome with throttling only; no real devices.
- **Freeze date:** not frozen.
- **Reopening history:** none.

## Portion 3: Shared UI and responsive layout

- **Status:** PENDING
- **Scope:** The app frame, the shared compact game layout, shared controls (header, stake chips), CSS
  tokens and layout CSS.
- **Files owned:** `src/core/ui/AppShell.tsx`, `src/core/ui/GameLayout.tsx`, `src/core/ui/GameHeader.tsx`,
  `src/core/ui/StakeChips.tsx`, `src/core/ui/layoutScroll.ts`, `src/styles.css` (except boot loader CSS and
  `@font-face`; O12), `check:games` rule 7, `docs/06-RESPONSIVE-GAME-LAYOUT.md`, `tests/e2e/layout.spec.ts`.
- **Public interfaces:** `AppShell`, `GameLayout` and its props, `GameHeader`, `StakeChips`,
  `resetLayoutScroll`; CSS custom properties (tokens, `--pbf-host-height`).
- **Dependencies:** 1 (`formatMoney`); 6 (`useCoreT`).
- **Tests executed:** none yet.
- **Acceptance criteria (draft):** `layout.spec` passes at every size in doc 10; essential controls within
  about 50% of the height in portrait; no horizontal overflow; operator element height respected.
- **Known limitations:** tokens duplicated in `pixi/theme.ts` and `index.html` (O12).
- **Freeze date:** not frozen.
- **Reopening history:** none.

## Portion 4: PixiJS rendering engine

- **Status:** PENDING
- **Scope:** One Pixi Application per stage, scenes driven by props, config-driven views, canvas sizing,
  stage asset loading and unloading, canvas theme, Pixi text relabelling on language change.
- **Files owned:** `src/core/pixi/PixiStage.tsx`, `CanvasFrame.tsx`, `buildView.ts`, `scene.ts`,
  `stageAssets.ts`, `theme.ts`, `usePixiEffect.tsx`, `viewConfig.ts`, `viewConfig.check.ts`;
  `check:games` rules 5 and 6; `docs/04-RENDERING-REACT-PIXI.md`; `tests/e2e/resize.spec.ts`.
- **Public interfaces:** `PixiStage` props (incl. `critical`), `CanvasFrame`, `PixiScene`, `SceneFactory`,
  `SceneContext`, `StageAsset`, `buildView`, `relabelTexts`, view config types and validators,
  `COLORS`, `FONTS`, `usePixiEffect`.
- **Dependencies:** 2 (`startup`, `registerAsset`); 6 (`translate`, `onLanguageChange`).
- **Tests executed:** none yet.
- **Acceptance criteria (draft):** `viewConfig.check` and both games' scene `config.check` pass;
  `resize.spec` passes (same canvas element, no leaked listeners); stage teardown releases assets.
- **Known limitations:** WebGL only (WebGPU not used); no real-device GPU measurements.
- **Freeze date:** not frozen.
- **Reopening history:** none.

## Portion 5: Round lifecycle and server timing

- **Status:** PENDING
- **Scope:** Server-authoritative round timing on the client: clock synchronisation, snapshot ordering,
  countdown display, duplicate-action and same-key retry protection, and the client phase machine (O7).
- **Files owned:** `src/core/round/serverClock.ts`, `roundTracker.ts`, `actionGuard.ts`, `react.ts`,
  `mockClock.ts`, `round.check.ts`; `src/core/services/RoundEngine.ts`, `src/core/hooks/useRoundEngine.ts`,
  RoundEngine assertions from `services.check.ts` (O8). A round lifecycle doc (none exists today).
- **Public interfaces:** `createServerClock`, `ServerClock`, `timed`, `monotonicNow`; `createRoundTracker`,
  `RoundSnapshot`, `RoundPhase`, `LIVE`, `INSTANT`; `createActionGuard`, `retryWithSameKey`,
  `newRequestId`; `useServerClock`, `useServerNow`, `useCountdown`, `useAtServerTime`;
  `createMockServerClock`; `RoundEngine`, `PhaseDef`, `PhaseChange`, `useRoundEngine`.
- **Dependencies:** none in core.
- **Tests executed:** none yet (`round.check` passes at baseline but is not in `npm run check`).
- **Acceptance criteria (draft):** O7 boundary decided and documented; `round.check` in `npm run check`
  and passing; no core timer can open, close or settle a round; Higher or Lower and Acca Crash unchanged in
  behaviour.
- **Known limitations:** no real socket or server; timing verified against the mock clock only.
- **Freeze date:** not frozen.
- **Reopening history:** none.

## Portion 6: Internationalization and asset management

- **Status:** PENDING
- **Scope:** Core and game dictionaries, language selection and live switch, pseudo language, number and money
  locale; asset locations, `assetUrl`, content versions, fonts, the build's asset copy, shared common path.
- **Files owned:** `src/core/i18n/*` (`en.ts`, `index.ts`, `pseudo.ts`, `react.ts`, `i18n.check.ts`),
  `src/core/hooks/useApiMessage.ts` (O11), `src/core/boot/assetUrl.ts` (O6), `src/core/assets/*`,
  `public/assets/common/*`, `gameAssets` and `assetVersions` build code (O1), `@font-face` in
  `src/styles.css` (O12), `check:games` rule 9, `docs/07-ASSET-MANAGEMENT.md`, an i18n doc (B3),
  `tests/e2e/i18n.spec.ts`.
- **Public interfaces:** `initI18n`, `setLanguage`, `getLanguage`, `onLanguageChange`, `translate`, `hasKey`,
  `resolveLanguage`, `normalizeLanguage`, `availableLanguages`, `formatNumber`, `localeOf`,
  `setMissingKeyHandler`, `PSEUDO_LANGUAGE`, `Dictionary`, `DictionaryLoader`, `Vars`, `CoreKey`;
  `useLanguage`, `useCoreT`, `makeTranslator`; `useApiMessage`; `assetUrl`; `public/assets/<common|id>`
  layout; `?v=` URL rule.
- **Dependencies:** 1 (`setMoneyLocale`, `ApiError`).
- **Tests executed:** none yet (`i18n.check` passes at baseline).
- **Acceptance criteria (draft):** `i18n.check` and `i18n.spec` pass; only the selected language is
  downloaded; O13 and O14 decided and documented; B3 resolved.
- **Known limitations:** English only; Last Man Standing declares no translations (hard-coded English);
  common files are downloaded again per game (doc 02 gap).
- **Freeze date:** not frozen.
- **Reopening history:** none.

## Portion 7: Game-specific architecture and independent backend integrations

- **Status:** PENDING
- **Scope:** Each game's folder: screens, scenes, CSS, dictionaries, typed API contract, mock server and its
  self-check; the shared mock transport. Real backend integration per game when contracts exist.
- **Files owned:** `src/games/higherlower/*`, `src/games/accacrash/*`, `src/games/lastmanstanding/*`,
  `public/assets/<id>/*`, `src/core/services/mockTransport.ts` (O9), `docs/09-BACKEND-INTEGRATION.md`,
  `tests/e2e/games.spec.ts`.
- **Public interfaces:** each game's `index.ts` definition and `api/types.ts` contract (game-owned, not
  shared); `mockTransport`, `mockInitError`, the `?mockInitError=` launch parameter.
- **Dependencies:** 1 to 6.
- **Tests executed:** none yet.
- **Acceptance criteria (draft):** each game's mock self-check passes; `games.spec` passes; no shared betting
  protocol in core; no invented endpoints or payloads; each game reviewed one at a time and frozen per game if
  approved.
- **Known limitations:** no backend contracts exist (doc 09, Q1), so real integration is externally blocked;
  Acca Crash mock rework in progress at baseline (B1).
- **Freeze date:** not frozen.
- **Reopening history:** none.

## Portion 8: Testing and developer experience

- **Status:** PENDING
- **Scope:** The test harness and the tools developers use: browser test setup, build server for tests,
  new-game scaffold, lint and format config, the `check` registry, the development and testing guides.
- **Files owned:** `playwright.config.ts`, `scripts/serve-builds.mjs`, `scripts/new-game.mjs`,
  `tests/tsconfig.json`, `tests/e2e/helpers.ts`, `eslint.config.mjs`, `.prettierrc`, `package.json` scripts
  (O3), `check:games` rule 3, `docs/03-GAME-DEVELOPMENT-GUIDE.md`, `docs/10-TESTING-STANDARDS.md`.
- **Public interfaces:** npm scripts (`typecheck`, `lint`, `format`, `check`, `check:games`, `new-game`,
  `test:e2e`); scaffold output; `tests/e2e/helpers.ts` exports.
- **Dependencies:** 1 to 7.
- **Tests executed:** none yet.
- **Acceptance criteria (draft):** a freshly scaffolded game passes `typecheck`, `lint`, `check` and builds;
  the full suite runs from one documented command; doc 10 matches the real suite.
- **Known limitations:** e2e runs in installed desktop Chrome only.
- **Freeze date:** not frozen.
- **Reopening history:** none.

## Portion 9: Production readiness

- **Status:** PENDING
- **Scope:** Going live: hosting requirements (HTTP/2, immutable caching for `?v=` URLs), shared common
  asset path configured, real-device performance, release and rollback process, per-game production
  backend configuration.
- **Files owned:** none yet (hosting and release configuration to be defined).
- **Public interfaces:** deployment layout and hosting requirements.
- **Dependencies:** all portions.
- **Tests executed:** none yet.
- **Acceptance criteria (draft):** defined when Portion 8 is frozen.
- **Known limitations:** depends on backend contracts (7) and on hosting decisions outside this repo.
- **Freeze date:** not frozen.
- **Reopening history:** none.

---

## Recommended first portion

**Portion 1: Foundation and game isolation.**

- Every other portion builds on its contract (`GameDefinition`), its build model and its isolation rules.
  Freezing it first means nothing below it can move.
- Five of the overlaps (O1, O2, O4, O8, O10) are about which file belongs to which portion. They must be
  settled before anything is frozen, and Portion 1 is where those files live.
- It is small (about ten files), mostly implemented, and already guarded by `check:games`.

**Preconditions before Portion 1 starts (need approval):**

1. Restore a green baseline (B1): finish or park the in-progress Acca Crash mock rework so `npm run lint` and
   `npm run check` pass. That work belongs to Portion 7, so how it is handled is a decision for the team.
2. Approve or reject exceptions E1 and E2.
3. Approve or change the proposed freeze order (1, 6, 3, 2, 4, 5, 7, 8, 9).
4. Commit a baseline (B2) so frozen files can be checked against it later.
