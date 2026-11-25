# 20. Casino and bingo framework plan

Goal: one lightweight framework for 30+ independent casino and bingo games. Build only what several games
genuinely share; everything else stays in the game.

## Rule for adding anything to the core

A system goes into `src/core` only when **three or more games** need it, or two games already exist that
copy it. Until then it lives in the first game that needs it. Each core system must:

- work without Pixi (renderer-independent), or live under `core/pixi` and be imported only by Pixi games;
- add nothing to the boot bundle of a game that does not use it (import it from the screen, not the boot);
- have a typed contract and a self-check (`*.check.ts`) when it holds logic.

## Game families and the kit each one gets

| Family | Example games | Flow | Kit (core) | Proving game |
|---|---|---|---|---|
| 1. Instant result | Dice, Limbo, Plinko, Wheel, Roulette, Baccarat, Diamonds, Darts, Packs | bet, one request, animate result | `useInstantBet` | Dice |
| 2. Step and cash out | Mines, Hilo, Dragon Tower, Chicken, Pump, Snakes, Flip, RPS, Blackjack | start, actions, cash out or bust; resumable | `useStepSession` | Mines (Higher or Lower already uses the pattern) |
| 3. Live round | Crash, Slide | shared timed rounds, join and cash out | `RoundEngine` + `useRoundEngine` (exists) | Acca Crash (exists) |
| 4. Slots and reels | Tome of Life, reel titles | spin, reels stop, wins, features | `useInstantBet` first; a reel helper only after the second slot | first slot game |
| 5. Bingo and number draw | Bingo, Keno | buy tickets or picks, numbers drawn, server-detected wins | `useDraw` + ticket grid | Keno (instant draw), then bingo (timed draw) |

The kits are thin hooks over the backend contract (below). They own request state, balance updates, errors
and retry on reconnect. They do **not** own animation, layout or game rules.

## Shared systems

Already built: boot and loading lifecycle (`docs/loading-audit`), launch params, error screens, `PixiStage`
with config-driven views, money helpers, `RoundEngine`, mock transport, app frame.

To build, in this order:

| # | System | Why it is shared | Size target |
|---|---|---|---|
| 1 | **Contracts** (`core/contracts`) | Every game talks to the backend the same way; mocks and real clients implement the same types | types only |
| 2 | **Wallet** (`core/wallet`) | One balance source, updated from every bet/settle response; currency decimals from `init` | small store |
| 3 | **Bet panel** (`core/ui/BetPanel`) | Amount, half, double, min, max, play button, profit readout, Manual and Auto tabs; limits from `init` | DOM only |
| 4 | **Flow kits** (`core/bet`) | `useInstantBet`, `useStepSession`, later `useDraw` | hooks |
| 5 | **Layout modes** (`AppShell`) | Today: phone column. Add `wide`: game area plus side panel on desktop, panel below on phones | CSS |
| 6 | **Fairness** (`core/fairness`) | Seed hash, client seed, nonce in every result; one modal | modal + types |
| 7 | **Autoplay** (`core/bet/autoplay.ts`) | Number of bets, stop on profit or loss, change on win or loss; pure TS, unit-checked; jurisdiction-gated | pure TS |
| 8 | **Sound** (`core/audio`) | Web Audio, lazy per game, mute and volume remembered; never in the boot path | tiny |
| 9 | **Settings** | Animation speed (where allowed), hotkeys, reduced motion | small |
| 10 | **History / live bets** | Personal history and a live feed panel (Acca Crash has its own today) | optional module |

Not shared, on purpose: outcome maths, RTP and payouts (backend), per-game animation, Plinko paths, Blackjack
rules, slot features, game layout inside the game area.

## Backend contract (all authoritative logic on the server)

Every bet-related response carries the same envelope:

```ts
type BetEnvelope = {
  roundId: string;
  balance: number;          // wallet after this response
  currency: string;
  payout: number;           // 0 until settled
  multiplier: number;
  fairness?: { serverSeedHash: string; clientSeed: string; nonce: number };
};
```

| Family | Calls | Game-specific part |
|---|---|---|
| Instant | `play({ stake, params }) -> BetEnvelope & { outcome }` | `params` (target, risk, picks), `outcome` (roll, path, segment) |
| Step | `start({ stake, params })`, `act({ sessionId, action })`, `cashout({ sessionId })`; `init` returns any active session to resume | `action`, revealed state |
| Live round | existing round contract (doc 19, Acca Crash) | round data |
| Slots | `spin({ stake, mode }) -> BetEnvelope & { reels, wins, feature? }`; `init` returns unfinished features | symbols, paylines/ways, features |
| Draw | `buy({ stake, tickets | picks })`, `draws` (poll or stream), wins detected by the server | ticket layout, draw rules |

`init` adds, for every game: bet limits (min, max, step), max payout, currency decimals, feature flags
(autoplay, turbo, fairness) and any session to resume. The client never computes an outcome or a payout;
it only displays what the server returned.

## Layout of a game folder (unchanged, plus contracts)

```
src/games/<id>/
  index.ts            defineGame: id, title, renderer, preload, createApi, loadScreen
  <Name>Screen.tsx    screen: core BetPanel + the game area
  <id>.config.ts      game config (grid size, colours, timings)
  scenes/             Pixi view + config (only if renderer: 'pixi')
  api/types.ts        game-specific params/outcome, extending core contracts
  api/mockServer.ts   mock implementing the same contract (+ .check.ts)
public/assets/<id>/   the game's own art, loaded on demand
```

## Performance budgets (from the loading work)

| Budget | Target |
|---|---|
| Boot JS (core + React), excluding the game screen | 60 KB gz or less (today about 86 KB with React) |
| DOM games | never request Pixi |
| Critical assets for the first screen | 150 KB or less; everything else after playable |
| Time to playable, Fast 4G | cold 1.5 s or less, warm 0.5 s or less |
| New core system | 0 KB added to games that do not use it |

## Regulatory switches (must be decided before autoplay and turbo)

PBF games currently target GBP and show BeGambleAware messaging. Under UK Gambling Commission rules for
online slots, autoplay, turbo/slam-stop and spins faster than 2.5 s are not allowed. So `autoplay`,
`turbo` and `minRoundMs` come from `init` per jurisdiction and per game family, never hard-coded on.
Provably-fair display is optional and also a flag.

## Build order

1. Contracts + wallet + bet panel + `wide` layout, proven on **Dice** (instant).
2. `useStepSession`, proven on **Mines**; move Higher or Lower onto it.
3. Fairness modal, sound, settings.
4. Autoplay (behind the jurisdiction flag).
5. `useDraw` with **Keno**, then a bingo game.
6. First slot game; a reel helper only when the second slot starts.

Each step ends with: typecheck, lint, self-checks, build, a browser check of every existing game, and the
loading measurement for the new game (`docs/loading-audit` method).

## Open questions

1. Real backend contract for the new games (doc 10, Q1): does the provider already have a per-family API?
2. Jurisdictions and currencies (decides autoplay, turbo, fairness, decimals).
3. Desktop layout: keep the PBF phone column, or the wide layout with side panel for these games?
4. One host path for shared files across games, so fonts and React are cached once (loading audit risk).
