# 17. Framework status

State of the framework after the Pixi hook and the new-game scaffold. Everything below runs on mock backends; no real PBF backend contract exists yet (doc 10, Q1).

## What is complete

| Area | Status |
|---|---|
| Core (`src/core`) | `PixiStage` (per-mount Application, single teardown), `usePixiEffect`, typed scene contract, ref counted stage assets, `RoundEngine` and `useRoundEngine`, `useApiMessage`, `ApiError`, money helpers, mock transport, `AppShell` (PBF desktop frame), `GameHeader`, `StakeChips`, `GameBoot` (launch params, preloader, init-error screens) |
| Game contract | `defineGame`; one game per dev server and per build via `GAME_ID`; games build standalone to `dist/<id>` |
| Rules enforced by a check | `npm run check:games`: every game has a `defineGame` entry, imports no other game, and has a self-check that `npm run check` runs |
| New games | `npm run new-game -- <id> "<Title>"` creates a working placeholder that passes every gate; guide in doc 16 |
| Higher or Lower | Complete on a mock backend (intro, tutorial, six markets, run ladder, cash-out, staged card reveal, live feed, win confetti) |
| Acca Crash | Complete on a mock backend (crash curve scene, boosters, cash-out) |
| Last Man Standing | Complete on a mock backend (3 leagues, 3 difficulties, fixture planner, prize ladder, match playback, cash-out). Browser-tested on a phone-width window: start, win, loss, cash-out, planner |

## Gates (all green at the time of writing)

`npm run typecheck`, `npm run lint`, `npm run check` (structure plus four mock backend self-checks), `npm run build` (every game).

## Verified in a browser

- Higher or Lower: a full round (pick, reveal, result, history, feed, balance).
- A scaffolded game: boots, plays, no console errors or broken images.

## Not done

| Item | Why it matters |
|---|---|
| Real backend clients | Games call mocks. The contract for the new games must be agreed first (doc 10, Q1) |
| Operator integration check | Must pass before the iframe can be removed |
| Not browser-tested | phone width on all games; cash-out and long streaks in Higher or Lower; the confetti visually |
| Higher or Lower omissions | 1-versus-2 market mode switch, leaderboards, sound |
| Automated UI tests | Mock backends have self-checks; screens are verified by hand. No component or end to end test runner yet |
| Version control | The folder is not a git repository, so nothing is committed or reviewable as a diff |

## Suggested order

1. Put the folder under git and make a baseline commit.
2. Agree the backend contracts (Q1) and run the operator integration check.
3. Add an end to end test runner against the mock backends, using the browser walkthroughs above as the first cases.
4. Replace mock clients per game, one at a time.
