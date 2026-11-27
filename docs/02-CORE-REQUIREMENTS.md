# 02. Core requirements

The five requirements every PBF casino game must meet, the standard each game follows, what the framework
does today and what is still missing. "Close by" items are proposals, not implemented.

Status key: **Met**, **Partly**, **Missing**. Figures come from the measurements in docs 05 and 06.

## Summary

| # | Requirement | Today | Main gap |
|---|---|---|---|
| 1 | Extremely fast loading | **Partly** | Fast 4G cold 0.8 to 1.6 s, warm 0.38 to 0.54 s; slow links 2.9 to 5.3 s; no per-game font/sound handling yet |
| 2 | No loading spinners | **Partly** | No spinner anywhere, but a full-screen "Loading NN%" overlay hides the game until the first frame |
| 3 | React + PixiJS | **Met** | Keep it that way as new systems are added |
| 4 | Compact layout (game + controls in about half the mobile height, no scroll) | **Met for the three games** | Game-specific refinements listed in doc 06 |
| 5 | Common and game assets, languages | **Partly** (assets) / **Missing** (languages) | No i18n at all; shared files are re-downloaded per game |

## 1. Extremely fast loading

**Standard for every game**
- `defineGame` with `renderer`, `preload` (first screen only) and `loadScreen` (dynamic import).
- `index.ts` stays light; no screen or scene imports.
- Assets through `assetUrl()`; game atlases sized to what the game draws.
- Loading measured per game with the method in doc 10 before release.
- Budgets: Fast 4G cold 1.5 s or less, warm 0.5 s or less; first screen assets 150 KB or less.

**Today: Partly met**
- Done: parallel startup from the HTML, Pixi only for Pixi games, versioned immutable assets, WOFF2 fonts,
  overlay until first frame, failure handling (doc 05).
- Measured: Fast 4G cold LMS 786 ms, Acca 1520 ms, HL 1550 ms; warm 375 / 480 / 537 ms.

**Gaps**
- Slow links: 2.9 to 5.3 s cold (bytes plus HTTP/1.1 queuing on the test server).
- The four fonts (119 KB) gate Pixi games; no subsetting.
- Fonts are a fixed list in `GameBoot`; a game cannot declare its own fonts.
- No sound system, so no rule yet for when sounds load (they must never be on the startup path).

**Close by**
- Fonts declared per game (`defineGame.fonts`), core fonts subset per language (see 5).
- Sound manager that loads after `pbf:playable`.
- HTTP/2 hosting plus the `?v=` immutable rule (host work).

## 2. No loading spinners

**Standard for every game**
- No spinner and no blank screen at any point.
- The game frame and controls appear as early as possible; only the parts that genuinely need data or
  assets wait, and they wait in place (a static placeholder of the right size), not behind a full-screen
  screen.
- In-game waits (bet in flight, round starting) show state in the control itself (button label, disabled
  state, countdown), never an indefinite indicator.
- Background (non-critical) assets never block play; failures show a clear message with a retry or reload.

**Today: Partly met**
- No spinner exists in the codebase (searched: no spinner element or class; all CSS animations are game
  effects).
- The HTML paints an inline loader at about 200 ms (indeterminate bar), then `GameBoot` shows a
  full-screen loader with "Loading NN%" until the first frame. Real progress, but it is still a loading
  screen covering the whole game.
- Failures: font, asset, code, renderer and session failures are handled and tested (no stuck states).

**Gaps**
- The full-screen overlay: the player sees no game UI until everything is ready.
- The inline bar is an indefinite indicator.

**Close by: "skeleton first" startup**
1. The HTML paints the game's frame (header, stage area, control area) at its final size instead of a bar.
2. As soon as the boot JS runs, React renders the real screen layout: header, bet panel (disabled until the
   session returns balance and limits), and the stage area showing a static placeholder (game background
   colour or a tiny inline image).
3. The stage fills in when the canvas draws its first frame; controls enable when session + stage are ready.
4. `pbf:playable` stays the same definition (controls enabled, first frame drawn), so the loading numbers
   remain comparable.
5. The "Loading NN%" text is removed; progress remains in the marks for telemetry only.

Constraint: the bet panel needs balance and limits from `init`, so it shows its layout immediately but
enables only after the session (typically 80 to 150 ms after the boot runs, mock figures).

## 3. React + PixiJS integration

**Standard for every game**
- React: all UI, controls, information, layout. Pixi: only canvas gameplay and effects.
- One `PixiStage` per canvas, scenes driven by props and reporting through typed events; no shared stores
  inside scenes; views built from config (`buildView`).
- `renderer: 'dom'` games never import Pixi; the boot never imports Pixi.

**Today: Met**
- Verified in the loading work: Last Man Standing requests no Pixi file; Pixi games get one canvas;
  scenes update by props (no per-frame React renders); stage lifecycle and teardown tested.

**Keep it met**
- New core systems (bet panel, i18n, sound) must be renderer-independent; Pixi helpers stay in
  `core/pixi` and are imported only from screens of Pixi games.
- Game state lives in React (or the flow kit); the scene receives the slice it draws. No second copy of
  state inside scenes.

## 4. Fully responsive, compact layout

**Standard for every game**
- The playable unit (game area + essential controls) fits in about **50% of the mobile height** in
  portrait, with no scrolling to reach controls.
- Rules, how to play, history, live feeds and other information go in a separate scrolling section.
- Sizes follow the game's container (standalone page, operator iframe or operator element), not the window.
- Portrait, landscape and desktop all supported; no clipped or overlapping controls.

**Today: Met for the three games.** Shared `GameLayout` (`src/core/ui/GameLayout.tsx`), container-sized
frame, landscape layout, `CanvasFrame fill`, Pixi resizing without re-init. Essential controls end at 48 to
53% of the height on 360 to 430 px phones and desktop (before: 71 to 104%), and are visible at every tested
size including 320x568, landscape and small embeds. Remaining game-specific issues and all measurements:
[06-RESPONSIVE-GAME-LAYOUT.md](06-RESPONSIVE-GAME-LAYOUT.md).

## 5. Common and game assets, languages

### Assets

**Standard**
- Shared art, fonts and sounds in one central place; game art in the game's own folder; both loaded on
  demand and versioned.
- A common file already in the browser cache is never downloaded again, from any game.

**Today: Partly met**
- `public/assets/common` + `public/assets/<id>` exist; a build ships only common + its own game; asset URLs
  carry content versions; game atlases are separate (HL badges).
- Gap: each build copies `common` (and bundles React and fonts) under its own path, so URLs differ per game
  and the browser downloads them again for every game. "No duplicate downloads" is true within a game only.
- Gap: per-game fonts and sounds have no declared place or loading rule.

**Close by**
- Publish shared files once to a shared path (for example `/pbf-common/v<hash>/`) and point every game's
  `assetUrl('common/...')` and font URLs there (build setting `COMMON_BASE`).
- Optionally a shared vendor bundle (React, React DOM) at the same shared path; measured before adopting.
- `public/assets/<id>/fonts` and `/sounds` with declarations in `defineGame` (fonts) and a sound manifest.

### Languages and translations

**Standard**
- Shared dictionary for common UI (bet controls, buttons, labels, errors, settings): `core/i18n/<lang>.ts`.
- Game dictionary for rules, instructions, name, description, messages: `games/<id>/i18n/<lang>.ts`.
- Only the selected language is downloaded (dynamic import per language), in parallel with the session.
- One `t(key, vars)` used by React and by Pixi text (config elements reference keys, not literal text).
- Numbers, money and dates formatted with `Intl` for the selected locale.
- Adding a language: add one file to core and one per game; nothing else changes. Adding a game: its own
  folder only. Missing keys fall back to English and are reported by a self-check.

**Today: Missing**
- No translation system. Text is hard-coded in English across screens (at least 55 literal text nodes in
  JSX by a quick count, plus strings in configs, error maps and mock data).
- `launchParams` already reads `lang` / `language` (default `en`) but nothing uses it.
- Pixi config elements carry literal `text` values ('VS', '?', label texts).

**Close by**
- `core/i18n`: `loadLanguage(lang)` (core + game dictionaries, started in the boot in parallel), a typed
  `t()` with key checking (TypeScript derives keys from the English dictionary), `useT()` for React, and a
  `textKey` field for Pixi text elements in `buildView`.
- Font coverage per language: Degular and Avenir must contain the glyphs of every supported language (check
  before adding e.g. Turkish, Polish, Greek); otherwise a per-language fallback font.
- A self-check that every language file has every key of English, per core and per game.
- Right-to-left languages are out of scope until requested (layout mirroring would be extra work).

## Architecture review (2026-11-25)

A read-only review of the cleaned repository against these requirements and the plan to add many more games.
It records what the code shows; nothing was changed by the review.

**Conventions across the three games.** All three use `defineGame` with `renderer`, `preload` and
`loadScreen`, build every screen on `GameLayout` with their own `--pbf-play-min`, and have a typed contract,
a mock server with a self-check and `useApiMessage`. Both Pixi games use `CanvasFrame fill` and a
`<PixiStage critical>` with a view config and a config self-check. Deviations:
- Last Man Standing scrolls the core's internal layout elements directly
  (`querySelectorAll('.pbf-layout, .pbf-play-stage, .pbf-info')`); the core should offer this as a function.
- `check-games` does not enforce `GameLayout` use, nor that a `renderer: 'dom'` game never imports
  `core/pixi` (which would load Pixi silently).

**Game-specific leftovers in the core** (no game rules or outcomes are in the core; these are styling and
branding):

| Leftover | Where | Used by |
|---|---|---|
| Card tier colours (`TIER_COLORS`) | `src/core/pixi/theme.ts` | Higher or Lower only |
| 10 of 13 `@keyframes` | `src/styles.css`, loaded by every game | Acca Crash 9, Higher or Lower 2 |
| Default `eyebrow = 'Playbook'` | `src/core/ui/GameHeader.tsx` | every game, while the frame is meant to be brand-free |

**New-game template.** A game generated by `npm run new-game` passed typecheck, lint, its self-check and the
build, and its check was registered automatically. A developer then writes the contract, the mock rules and
the screen. The template scaffolds a DOM game only; a Pixi stage is copied from Higher or Lower.

**Gaps that grow with the number of games:**

| Gap | Why it gets expensive |
|---|---|
| Round timing is set in the browser: `RoundEngine` runs fixed client durations and the client calls `settle` / `start` when its timer ends; a phase cannot be entered with a server-given end time | every live or shared-round game needs the server clock; retrofitting it per game costs more than one core change |
| Each game's backend integration is a mock; no reusable technical helpers (idempotency keys, retry with the same key, server clock sync) and no written integration conventions | each new game would re-solve the same technical problems differently |
| No translations | every new game adds hard-coded English to extract later |
| No reusable betting UI primitives | every casino game rebuilds stake input and bet-button states |
| Game-specific styles and colours in core files | every game downloads them and the core keeps growing |
| Conventions not enforced by checks | mistakes appear as more developers write games |
| One build per game at its own path | shared files (fonts, React) are downloaded again for each game |
| Browser, layout and loading tests run from scripts outside the repository | regressions across many games cannot be caught routinely |

Player volume: the games are static files, so load at scale falls on the backend and the CDN, neither of
which exists yet; nothing here shows readiness for large player volumes either way.

**Status summary**

| Status | Items |
|---|---|
| Implemented | One build per game; parallel startup with Pixi only for Pixi games; failure handling and timeouts; shared compact layout with landscape and embed support; Pixi stages that resize without re-initialising, config-driven scenes; versioned assets and trimmed atlases; typed contracts with mock servers and self-checks; structure checks; the new-game template |
| Partly | Loading performance (measured on a local server only); no waiting (a full-screen loader remains); asset sharing (common files, not cached across games); small-screen layout (320 px and small embeds); testing (self-checks only) |
| Missing | Translations; real per-game backend integrations, sockets and operator messaging; server-driven round timing; reusable betting UI primitives; sound; repeatable browser tests in the repository; real-device and production-network measurements |

## Build order for the open gaps

From the review, ordered by how much each gap costs to fix later:

1. Server-driven round timing in `RoundEngine` (enter a phase with a server end time).
2. Per-game backend architecture with optional technical utilities and written conventions (real integrations wait for each game's backend contract, doc 09 Q1).
3. Translations: shared and game dictionaries for React and Pixi text, English extracted from the three games
   (requirement 5).
4. Browser, layout and loading tests runnable from `npm` scripts in the repository.
5. Small clean-ups: move one-game keyframes and `TIER_COLORS` into their games, add the missing
   `check-games` rules, give the core a scroll-reset function.
6. Skeleton-first startup (removes the full-screen loader, requirement 2).
7. A shared path for common files across games, per-game fonts and sounds (requirements 1 and 5).
8. Font subsetting per language (after step 3 gives the glyph lists).

Each step: typecheck, lint, self-checks, build, browser check of every game at the layout sizes, and the
loading measurement, so speed does not regress (doc 10).

## Foundation implementation (2026-11-25)

Re-audit of the review findings against the code before any change:

| # | Finding | Verified |
|---|---|---|
| 1 | Client-controlled round timing | Confirmed: Higher or Lower (betting 8 s, result 1.6 s) and Acca Crash (betting 5 s, ended 3 s) advance phases on browser timers (`RoundEngine`), and the client calls `settle` / `start` when its timer ends |
| 2 | No shared backend client | Confirmed: no `fetch`, WebSocket or socket code; each game's `createApi` returns its own mock |
| 3 | No shared wallet or bet contract | Confirmed: balance is set by hand in 9 places across the games; no idempotency anywhere |
| 4 | No translations | Confirmed: `launchParams` reads `lang`, nothing uses it |
| 5 | Game styles and branding in core | Confirmed: `TIER_COLORS` (HL only), 10 of 13 keyframes used by one game, `eyebrow = 'Playbook'` default |
| 6 | Conventions not enforced | Confirmed: `check-games` checks names, `defineGame`, cross-game imports and self-checks only |
| 7 | Browser tests outside the repo | Confirmed: no test runner in `package.json` |
| 8 | No cross-game asset caching | Confirmed: every build copies `common` and hashes fonts under its own path |

Plan (each step small, testable, and recorded here only when built and tested):

| Step | Work | Depends on | Acceptance | Main risk |
|---|---|---|---|---|
| A | Browser tests in the repo (`npm run test:e2e`), before-numbers | none | three games, subfolder, sizes, errors, resize, failures, runnable by one command | flaky timing on a busy machine |
| B | Core isolation and convention checks | A | tier colours, keyframes and branding out of core; public scroll API; `check-games` enforces layout, definition and no Pixi in DOM games | visual regressions |
| C | Translations: shared + per-game dictionaries, English + a pseudo-locale test language, React and Pixi from one source | B | typed keys, fallback, missing-key warnings, live switching, `Intl` formatting; core + Higher or Lower converted | text regressions in converted screens |
| D | Server-authoritative round timing utility: server clock sync and a round-snapshot tracker (stale and duplicate protection); each game keeps its own round contract; mock server clock per game | A | phases and end times only from the game's server; display countdown from synced time; Acca Crash and Higher or Lower moved onto it | changing two working round flows |
| E | Per-game backend architecture: each game owns its API, connection, events, contracts, betting, settlement and recovery; core adds only optional helpers (idempotency key, retry with the same key, error-mapping convention) and written conventions | D | a retried game action is applied once; no universal client, shared bet contract or common protocol; no invented endpoints | over-abstraction |
| F | Betting UI primitives (stake input, quick stakes, bet button states): UI only, no betting contract | C | reusable pieces composed by games and the template | forcing one UI on all games |
| G | Cross-game caching investigation | A | measured reuse across games, safe on version change; only built if browser caching is not enough | host dependence |
| H | Regression and acceptance | all | all checks, builds, browser tests; before/after numbers | none |

**Backend rule.** Every game maintains its own independent backend integration, including API contracts,
connection management, events, betting operations, game state and settlement logic. PBF may provide optional
reusable technical utilities and integration conventions, but must not impose a universal backend client,
shared betting contract or common game protocol. Similar patterns are encouraged without coupling games.

Production endpoints, socket events and payloads are not invented: where the backend contract is missing, the
interface and the open decision are documented (doc 09) and the mock implements the interface.

## Planned direction: casino and bingo game families

The framework is meant to carry 30+ casino and bingo games in five families: instant result (Dice, Limbo,
Plinko), step and cash out (Mines, Hilo, Chicken), live round (Crash; Acca Crash already works this way),
slots and reels, and bingo / number draw (Keno, bingo). Rule: a renderer-independent system enters the core only when three or
more games need it; the opt-in Pixi toolkit under `core/pixi` (and later `core/audio`, `core/host`) is the approved exception: it is built ahead of need from the old framework's capability list, never loaded by the boot or by DOM games. Planned shared systems, none built yet (backend integration stays per game, see the backend rule above): a bet panel,
flow hooks per family (instant bet, step session, draw), a wide desktop layout, a fairness modal, autoplay
(jurisdiction-gated: UK rules ban autoplay, turbo and spins under 2.5 s for online slots), sound and settings.
The full plan, with the proposed contracts and build order, is in
[archive/plans-and-audits/20-casino-bingo-framework-plan.md](archive/plans-and-audits/20-casino-bingo-framework-plan.md).

## Decisions needed

1. Which languages first, and is right-to-left needed?
2. Can the host serve a shared common path across games (and HTTP/2 with the `?v=` cache rule)?
3. Design input for the remaining per-game layout refinements (doc 06).
4. Jurisdictions and currencies in scope (they decide autoplay, turbo and currency decimals).
