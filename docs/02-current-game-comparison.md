# 02. Current game comparison

Games compared:
- **US**: Ultimate Soccer, the live game (`pbf_ultimatesoccer_fe_v1`).
- **AC**: Acca Crash BTTS prototype (`C:\Users\venka\PBF\Acca Crash BTTS 2 (1).html`).
- **HL**: Higher or Lower v8 prototype (`C:\Users\venka\PBF\Playbook Higher or Lower v8 2 (1).html`).
- **LMS**: Last Man Standing prototype (`C:\Users\venka\PBF\Playbook Football_ Last Man Standing (1) 2 (1).html`).

The three prototypes are design exports, not production code: React UMD plus the PBF design-system bundle and a small UI runtime (AC, HL), or plain JS (LMS). All maths, RNG, balance and settlement run in the browser; balance is in `localStorage`. They use the same PBF assets and design tokens as US.

## 1. Mechanics
| | US | AC | HL | LMS |
|---|---|---|---|---|
| Core loop | Build team, pick odds markets, place bet, simulate match, result | Multiplier `exp(0.06 t)` plus goal boosts, crashes at a drawn point; cash out before crash | Next card OVR higher or lower; streak grows value; cash out | Pick a winning team each gameweek, no reuse, 20 rounds, ladder cash out |
| Round phases | selecting odds -> bet placed -> match started -> result | waiting (countdown) -> running -> ended | countdown -> locked -> reveal -> result -> reset | setup -> pick -> match sim -> verdict |
| Bet model | Multi-market slip (BTTS, correct score, handicaps, scorers...) | 2 bet panels, stakes 1 to 100, auto cash out | 6 "at least" markets, prices, streak bonus 5 to 15% | Stake 1 to 10, prize = 95% of 1/P(reach round) |
| Outcome source | Server (`StartMatch`, `MatchResult`) | Client (prototype) | Client (prototype) | Client (prototype) |
| Football data | Team, player cards, formation, kits, badges | Fixtures, scorer cards (tiers), goal timeline | Player DB (ATT, CRE, DEF, OVR, rarity, club, jersey) | Clubs with team ratings and scorers, outcome curve fitted to PBF results |
| Social | Leaderboards, leagues | Crowd, all bets / previous / top, history | Bots, live feed, cash and streak leaderboards | None |
| Meta features | Boosters, vault/pot, penalty, challenges, daily rewards, packs, divisions, FTUE | None | Splash, FTUE, mode switch | Guide |
| Tunables | `GAME_CONFIG`, `gameJSON.json` | RTP, boost scale, goal rate, countdown, volumes | RTP, q, mode | Rounds, stakes, difficulty |
| Rendering | Pixi canvas in iframe + React shell | React DOM | React DOM | Vanilla DOM |
| Audio | Howler, event-bound config | Web Audio synth | Web Audio | None |

## 2. Shared functionality (candidates for the engine)
| Capability | US | AC | HL | LMS | Engine module |
|---|---|---|---|---|---|
| Session init, token, balance, currency, limits | yes | needs | needs | needs | `backend/SessionService` |
| Timed round with phases | yes (implicit) | yes | yes | yes | `round/RoundEngine` |
| Place, cancel, cash out, auto cash out | place only | all | place, cash out | place, cash out | `bet/BetSlip` |
| Live multiplier or price | odds | curve | streak value | ladder | `round/presenters` |
| Player card with tier | yes | yes | yes | no | `football/PlayerCard` |
| Club, kit, fixture | yes | yes | yes | yes | `football/*` |
| Goal timeline / match sim | yes | yes | no | yes | `football/MatchSimPlayer` |
| Feed, leaderboard, history | partial | yes | yes | no | `social/*` |
| Audio with volume and mute | yes | yes | yes | no | `audio/*` |
| Error, maintenance, network popups | yes | needs | needs | needs | `render/PopupManager` + `core/ErrorService` |
| Operator wrapper messages | yes | needs | needs | needs | `wrappers/*` |
| Analytics | yes | needs | needs | needs | shell `services/analytics` |

## 3. Duplicated functionality inside US today
- Resume logic copied three times in `gameApp.ts` (784, 829, 882).
- `_transferInfoToPixi` helper copied in at least three shell files (`SessionHelper.tsx`, `util/miscUtils.ts`, `Home.tsx`).
- Two backend error-code maps (shell and canvas).
- Parallel V1/V2 components (top bar, player card, daily reward item, error popup, pack opening).
- Two `SHOW_SIMULATION` listeners; two `SoundManager` constructions.

## 4. Backend dependencies per game
| | US | AC, HL, LMS |
|---|---|---|
| Init / session | `Init`, `Me` (canvas) | Same core `Init` subset (identity, wallet, limits, locale, operator flags) |
| Round | `Odds`, `AddUpdateBet`, `PlaceBet`, `CurrentBetSlip`, `StartMatch`, `EndMatch`, `MatchResult` | New server operations needed (not existing): round open, bet, cash out, round result. Contract owner: backend team |
| Push | Socket `USER_BALANCE_UPDATE`, `CREDIT_PENDING_UPDATE`, `SHOW_POPUP`, `UNDER_MAINTENANCE` | Same events plus round tick and feed events (new) |

The new games cannot go live on client maths. Their backend contracts do not exist yet and must not be invented by the front end (doc 10, open question Q1).

## 5. Compatibility mapping (how each game fits)
| Framework part | US (migrated in place) | AC | HL | LMS |
|---|---|---|---|---|
| `GameDefinition` | `src/games/ultimate-soccer/definition.ts` wraps current config | new | new | new |
| Screens | existing 19 routes registered | 1 stage screen + panels | 1 stage screen | setup, pick, match, verdict |
| RoundEngine phases | selectingOdds, betPlaced, matchStarted, result | waiting, running, ended | countdown, locked, reveal, result, reset | pick, sim, verdict |
| Presenter | odds slip | crash curve | streak value | ladder |
| Assets | existing tree (common) | common + `games/acca-crash/` | common + `games/higher-lower/` | common + `games/last-man-standing/` |
| Shell | current drawers and stake panel | bet panels, feed | market buttons, feed, leaderboards | stake, ladder, guide |
| Backend | unchanged | new contract | new contract | new contract |

Migration rule: US keeps working at every step; new games are built React-first on the framework (doc 09, P5) and do not depend on the US canvas. Note (revision 2): in the React-first model, screens are React and only gameplay surfaces are Pixi scenes; the "Screens" row above means React screens plus the listed scenes.
