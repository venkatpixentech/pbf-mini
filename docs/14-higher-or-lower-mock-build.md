# 14. Higher or Lower on the framework (mock backend)

Date: 2026-11-23. Scope: doc 12 item 8, with mock data standing in for the backend (user instruction). PBF project untouched.

## What was built
| File | Layer | Purpose |
|---|---|---|
| `src/framework/services/money.ts` | Framework | `roundMoney`, `compareMoney`, `formatMoney` (numeric, 2 decimals, Intl currency) |
| `src/framework/services/RoundEngine.ts` | Framework | Timed phase machine: timed phases auto-advance, untimed ones wait for `advance()`; owns timers only, never outcomes |
| `src/games/higher-lower/api/types.ts` | Game contract | `HigherLowerApi` (`init`, `pick`, `settle`, `cashOut`), `RoundInfo`, `Market`, `Run`, `ApiError` codes. The real backend must implement these shapes |
| `src/games/higher-lower/api/mockData.ts` | **Mock** | 63 synthetic players, 3 per OVR 71 to 91 (not real PBF data) |
| `src/games/higher-lower/api/mockServer.ts` | **Mock backend** | Owns draws, prices (RTP 0.96, floor to 2 decimals), market availability, wallet, runs, streak cash-out bonus (5/10/15% at streak 3/4/5+), validation and error codes, simulated latency |
| `src/games/higher-lower/HigherLowerScreen.tsx` + `higherLower.css` | Game UI (React) | Balance, countdown, stake chips, six markets with prices, run panel with cash out, history, error messages. Pixi renders only the card reveal through `PixiStage` |
| `src/App.tsx` | App | Game at `/`, spike page at `#spike` (hash switch until a second game needs the route registry) |
| `src/spike/SpikePage.tsx` | Dev | The PixiStage lifecycle page, moved |

Round loop: `betting` (8 s) -> `locked` (calls `settle`, advances on reply) -> `reveal` (advances on the scene's `REVEAL_DONE`) -> `result` (1.6 s) -> `betting`.

## Rules (mock)
- Markets are "at least": `Hn` wins if next OVR >= current + n, `Ln` if next <= current - n; a tie loses.
- Price = floor(0.96 / P(win), 2 decimals), with P from the player pool minus the current card. Markets with P below 0.08 or above 0.92 are closed (so at OVR 71 or 91 only some markets are open).
- A run starts with a stake on the first pick, multiplies by the price on each win, and is lost on a wrong pick. No pick in a round leaves the run unchanged. Cash out is allowed during betting after at least one win, with the streak bonus.

## Checks
| Check | Result |
|---|---|
| `npm run check` services | Pass: money rounding and comparison (`10.5 > 2`), formatting, RoundEngine timed/untimed phases, stop, unsubscribe |
| `npm run check` mock server | Pass: settlement rule incl. ties, every open price within one floor step of RTP, closed market at lowest OVR, error codes (`ROUND_CLOSED`, `INVALID_STAKE`, `MARKET_UNAVAILABLE`, `NO_RUN`), simulated single-pick RTP 0.9518 over 20,000 rounds (below 0.96 because prices round down) |
| `tsc --noEmit` (strict), ESLint (PBF rules), `vite build` | Pass (lint fixed one purity warning: `Date.now()` during render) |
| Browser, mobile 375x812 | Renders; countdown, markets and prices update per round; reveal flips; result and history update; no runtime errors |

## Limits and risks
- **Mock only.** No real backend, wallet, operator or session. Replace `createMockServer()` with a real `HigherLowerApi` implementation once the contract exists (Q1). The screen already takes an `api` prop for that.
- **Maths is illustrative.** The streak bonus raises the effective return of long runs above 0.96; the maths owner must set the real model.
- **Timing is client-driven** in the mock. With a real backend, round open/close should come from the server (push or round schedule).
- **Not built (by design, until needed):** route registry, GameDefinition, core store, shared UI kit, operator wrappers, audio. The scene emits events for sounds when audio is added.
- **Not tested:** cash-out at the exact lock moment against a real server (doc 08 SV7), accessibility audit, iOS device.
- The play-test overlapped with manual clicks in the same tab, so the scripted run confirmed the loop and rendering rather than one specific pick result; the pick/settle/cash-out logic is covered by the mock server check.
