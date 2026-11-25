# 08. Validation and testing checklist (React-first)

Revision 2, 2026-11-23.
Columns: ID, scenario, expected, method, priority (P1 before the stage closes, P2 before release, P3 nice to have), A automated / M manual.
Scope tag: **T** target architecture (new games, framework), **L** legacy and migration (Ultimate Soccer, iframe, operators).
Automated tests need Vitest, React Testing Library and Playwright as dev dependencies (approval Q4). Fixtures are synthetic only: no real tokens, ids or captured credential-bearing responses.

## 1. PixiStage lifecycle validation (T) - required before any shared-context optimization
| ID | Scenario | Expected | Method | P | A/M |
|---|---|---|---|---|---|
| V1 | Mount and unmount `<PixiStage>` 50 times | No "too many active WebGL contexts" warning; context count returns to 0 | Playwright + console capture | P1 | A |
| V2 | Memory after V1 | JS heap and GPU textures back within 10% of start | DevTools / `performance.memory` sampling | P1 | M |
| V3 | Stage + FxLayer mounted together | Both render; FX unmount frees its context | Manual + console | P1 | M |
| V4 | iOS Safari: 20 navigations between screens with stages | No context loss, no blank canvas | Real device | P1 | M |
| V5 | Forced WebGL context loss | Error classified, stage recovers or shows controlled reload | `WEBGL_lose_context` | P1 | M |
| V6 | Scene `destroy()` | All listeners, tweens, timers removed (counter in scene context = 0) | Unit with spy context | P1 | A |
| V7 | Stage asset unload on unmount | Textures loaded by this stage removed from cache; shared ones kept | Unit + manual | P1 | A |
| V8 | Cold mount time of a stage | Within agreed budget on low-end Android | Performance trace | P2 | M |
Decision rule: if V1, V2 or V4 fail with per-mount Applications, evaluate context reuse as a separate approved change.

## 2. Pixi scenes (T)
| ID | Scenario | Expected | Method | P | A/M |
|---|---|---|---|---|---|
| SC1 | Props update | `update(props)` reflects state without re-init | Unit | P1 | A |
| SC2 | Typed events | Only declared events emitted; payload types compile | Type test + unit | P1 | A |
| SC3 | Scene isolation | No import of React, stores, Apollo or services | `check-boundaries` | P1 | A |
| SC4 | Resize | Layout correct for portrait sizes in device matrix | Screenshot diff | P2 | M |
| SC5 | Pause on hidden tab | Ticker stops, resumes on visible | Manual | P2 | M |
| SC6 | FPS during gameplay | 60 fps average, under 1% frames over 50 ms on low-end Android | Performance trace | P1 | M |

## 3. React framework (T)
| ID | Scenario | Expected | Method | P | A/M |
|---|---|---|---|---|---|
| RF1 | Game definition valid | `validate-games` passes | CI | P1 | A |
| RF2 | Missing route, scene or asset in definition | Named error | Unit | P1 | A |
| RF3 | Route registry and deep link | Correct screen; lazy chunk loads | Component + e2e | P1 | A |
| RF4 | Drawer, modal, popup hosts | Open/close via registry; popup priority order | Component | P1 | A |
| RF5 | Core store and game slice isolation | Slice cannot overwrite core keys | Unit | P2 | A |
| RF6 | Global error and unhandled rejection | Classified, shown in PopupHost | Unit | P1 | A |
| RF7 | Logger in production | No debug output; token-like keys redacted | Build check | P1 | A |
| RF8 | Accessibility of screens | Focus order, labels, contrast pass automated checks | axe in Playwright | P2 | A |
| RF9 | UI animation | CSS/GSAP only on React screens (no Pixi stage on non-gameplay screens) | Code review + boundaries | P2 | M |

## 4. Services (T)
| ID | Scenario | Expected | Method | P | A/M |
|---|---|---|---|---|---|
| SV1 | Session start | `Init` called once with existing variables; `beToken` in memory only | Unit with mocked Apollo link | P1 | A |
| SV2 | Init errors 2420/2436/2449, maintenance 60000, session 2300 | Same handling as today | Unit | P1 | A |
| SV3 | Socket reconnect and heartbeat | Disconnected popup after 4 s; recovery | Unit + manual | P1 | A |
| SV4 | Round phase table | Transitions and timers as defined; unknown server status raises error | Unit | P1 | A |
| SV5 | Bet place duplicate tap | One request | Unit + manual | P1 | A |
| SV6 | Numeric limits | "10.5" vs "2" compares correctly; min, max, max payout | Unit (`Money`, `StakeValidator`) | P1 | A |
| SV7 | Cash out race | Server decision wins; UI never shows a rejected payout | Manual with backend | P1 | M |
| SV8 | Malformed responses | Guard classifies error, no crash | Unit | P1 | A |
| SV9 | Audio | One binding per event, mute on hidden, volume buses | Unit + manual | P2 | A |

## 5. Assets (T and L)
| ID | Scope | Scenario | Expected | Method | P | A/M |
|---|---|---|---|---|---|---|
| AS1 | T/L | Configured atlases at @1x and @0.5x | Present | `validate-assets` | P1 | A |
| AS2 | L | US asset URLs | Identical to baseline | URL snapshot | P1 | A |
| AS3 | T | New game stage asset duplicates a common path | Build fails | `validate-assets` | P2 | A |
| AS4 | T | UI images exported from `canvas/src_assets` | Hashed by Vite, referenced, no missing imports | Build | P1 | A |
| AS5 | T | Stage asset load failure | Error popup with retry | Manual (block URL) | P1 | M |
| AS6 | T/L | Sounds configured vs files | All present | `validate-assets` | P1 | A |

## 6. Operator integration (L, gate for iframe removal)
| ID | Scenario | Expected | Method | P | A/M |
|---|---|---|---|---|---|
| OP1 | Capture outbound messages per platform strategy (own shell, Games Global, GameFlex, Aristocrat) with US in iframe | Baseline file per strategy | Harness page acting as operator parent | P1 | A |
| OP2 | Same capture for a React-first page | Same names, payloads, order | Harness diff | P1 | A |
| OP3 | Hop count and target window | Operator receives every message it received before (parent vs grandparent difference resolved) | Harness with nested frames | P1 | A |
| OP4 | Inbound operator messages (mute, balance, close, banking) | Handled identically | Harness | P1 | A |
| OP5 | Origin allow-list | Foreign origins ignored | Unit + harness | P1 | A |
| OP6 | Real operator staging run per strategy | Certified behaviour unchanged | Manual with operator | P1 | M |
Rule: no iframe is removed for US until OP1 to OP6 pass for every platform strategy in production use.

## 7. Ultimate Soccer regression (L)
| ID | Scenario | Expected | Method | P | A/M |
|---|---|---|---|---|---|
| US1 | GraphQL operation list | Identical to baseline | Baseline diff | P1 | A |
| US2 | Legacy bridge messages both directions | Identical names and payload shapes | Baseline diff | P1 | A |
| US3 | Socket event list | Identical | Baseline diff | P1 | A |
| US4 | Full round: odds, slip, place, start, sim, result | Same calls and screens | Manual + network log diff | P1 | M |
| US5 | Resume `SELECTING_ODDS` / `PLACE_BET` / `MATCH_STARTED` | As today | Manual | P1 | M |
| US6 | Each feature (boosters, vault/pot, penalty, challenges, daily rewards, packs, divisions, weekend champions, quick swap, fatigue, FTUE v2/v6) | As today | Manual checklist | P1 | M |
| US7 | Credit pending, void, delayed credit | As today | Manual (backend flags) | P1 | M |
| US8 | Build output and `canvas/assets-<id>` layout | Identical structure | Build diff | P1 | A |
| US9 | Deploy to dev and staging | Unchanged pipelines work | Pipeline run | P1 | M |
| US10 | Each screen moved to React in M3 | Visual parity, same calls, accessibility checks | Screenshot diff + network diff + axe | P1 | A/M |

## 8. Performance and soak (T and L)
| ID | Scenario | Expected | Method | P | A/M |
|---|---|---|---|---|---|
| PF1 | Cold load in operator iframe on throttled 4G | Interactive within agreed budget | Lighthouse / manual | P2 | M |
| PF2 | Bundle sizes per route and per game | Within budget | Build report | P2 | A |
| PF3 | 2-hour session with repeated rounds | No crash, stable memory | Soak | P2 | M |
| PF4 | Long React lists (history, leaderboards) | Smooth scroll on low-end devices (virtualized) | Manual | P2 | M |

## 9. Security (T and L)
| ID | Scenario | Expected | Method | P | A/M |
|---|---|---|---|---|---|
| SE1 | No token values in logs, fixtures, docs | None | Grep in CI | P1 | A |
| SE2 | Hard-coded fallback token removed | Absent | Grep | P1 | A |
| SE3 | `beToken` never posted to `'*'` | Explicit target origin or not sent | Unit + review | P1 | A |
| SE4 | Demo launch only in allowed modes | Not called with production config | Unit | P1 | A |
| SE5 | Devtools hooks absent in production | Absent | Build check | P2 | A |
