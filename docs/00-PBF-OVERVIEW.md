# 00. PBF game framework overview

A lightweight React + PixiJS framework for PBF casino-style games. Each game is an independent folder and an
independent build; shared platform code (boot and loading, layout, Pixi integration, money, round timing)
lives in `src/core`. The server decides every outcome; the client only displays it.

## Games

| Game | Id | Type | Rendering | Backend |
|---|---|---|---|---|
| Higher or Lower | `higherlower` | Shared timed rounds: back the next player's rating to be higher or lower, build a streak, cash out | Pixi card reveal + React UI | MOCK |
| Acca Crash | `accacrash` | Live crash rounds: a multiplier climbs while both teams score; cash out before the crash; scorer cards boost it | Pixi curve + React UI | MOCK |
| Last Man Standing | `lastmanstanding` | Pick one winning club each game week, each club once, climb a 20-round prize ladder, cash out any time | React only | MOCK |

All three started from HTML prototypes whose maths ran in the browser; those prototypes are specifications,
never production logic. PBF games are not slot machines: no reels, paylines or client-side random results.

## Quick start

```bash
npm install
npm run dev -- higherlower        # one game at a time, http://localhost:3100
npm run new-game mygame "My Game" # scaffold a working placeholder game
npm run typecheck && npm run lint && npm run check && npm run build
```

Builds go to `../pbf-game-builds/<id>` (outside the project); each is a static site that runs from any path.

## Status

| Area | State |
|---|---|
| Loading | Parallel startup, Pixi only when needed, versioned assets. Fast 4G cold to playable: 1.55 s (HL), 1.52 s (Acca), 0.79 s (LMS); warm 0.38 to 0.54 s (doc 05) |
| Layout | Shared compact layout: game + controls in about half a phone screen, landscape and embeds supported (doc 06) |
| React + Pixi | One Application per stage, config-driven views, resize without re-init (doc 04) |
| Assets | Common + per-game folders, content-versioned URLs, WOFF2 fonts, trimmed atlases (doc 07) |
| Backend | Mock servers implementing typed contracts; no real backend, operator messaging or socket yet (doc 09) |
| Translations | Core and game dictionaries with live switching (`src/core/i18n`); English only so far. Acca Crash and Last Man Standing still have hard-coded English text |
| Tests | Type, lint, structure and mock self-checks, plus Playwright browser tests in `tests/e2e` run against the builds (doc 10) |

## Documentation

| Doc | Read it for |
|---|---|
| [01-ARCHITECTURE.md](01-ARCHITECTURE.md) | Build model, folder map, module rules, decisions |
| [02-CORE-REQUIREMENTS.md](02-CORE-REQUIREMENTS.md) | The five requirements, their status, open gaps, planned casino/bingo direction |
| [03-GAME-DEVELOPMENT-GUIDE.md](03-GAME-DEVELOPMENT-GUIDE.md) | Adding a game, step by step, and its definition of done |
| [04-RENDERING-REACT-PIXI.md](04-RENDERING-REACT-PIXI.md) | `PixiStage`, scenes, view configs, when to use Pixi |
| [05-LOADING-PERFORMANCE.md](05-LOADING-PERFORMANCE.md) | Startup lifecycle, measured results, loading rules |
| [06-RESPONSIVE-GAME-LAYOUT.md](06-RESPONSIVE-GAME-LAYOUT.md) | App frame, `GameLayout`, per-game layouts, test results |
| [07-ASSET-MANAGEMENT.md](07-ASSET-MANAGEMENT.md) | Asset locations, `assetUrl`, versions, caching, size rules |
| [09-BACKEND-INTEGRATION.md](09-BACKEND-INTEGRATION.md) | Game contracts, example responses, PBF platform facts, security, open questions |
| [10-TESTING-STANDARDS.md](10-TESTING-STANDARDS.md) | Required checks, self-checks, browser, layout and loading verification |
| [archive/](archive/README.md) | Raw measurements, screenshots and the original audits (historical) |

There is no translations doc yet: nothing is implemented (see doc 02).

## Main risks

- No backend contracts for the three games yet (doc 09, Q1): the critical path to going live.
- Real-device performance (iOS Safari, low-end Android) is unmeasured.
- Production hosting must provide HTTP/2 and the `?v=` immutable cache rule to keep the measured gains.
