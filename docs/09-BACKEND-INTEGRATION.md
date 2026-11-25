# 09. Backend integration

How games talk to a backend today, the contract each game expects, and what is known about the real PBF
platform the games must eventually connect to. Rule above everything: **the server decides outcomes,
prices, fixtures and the wallet; the client only displays them.** Prototype maths that ran in the browser
are specifications, never production logic.

## How it works in the framework

| Piece | File | Role |
|---|---|---|
| Contract | `src/games/<id>/api/types.ts` | The game's `Api` interface, `InitResponse` (extends `CoreInit`), error code union. Source of truth for the shapes below. |
| Client factory | `defineGame({ createApi })` in `src/games/<id>/index.ts` | Builds the api from the launch params. Today every game returns its mock server here (marked `MOCK`). |
| Session start | `src/core/boot/GameBoot.tsx` | Calls `init()` once per api instance (also under React StrictMode), 15 s timeout, maps failures to blocking screens. |
| Errors | `src/core/services/apiError.ts` | `ApiError` with a string `code`; `SessionErrorCode` = `SESSION_INVALID` / `SESSION_EXPIRED` / `MAINTENANCE`. |
| Player messages | `src/core/hooks/useApiMessage.ts` | Maps a game's error codes to copy. |
| Mock transport | `src/core/services/mockTransport.ts` | MOCK only: simulated latency, `fail(code)`, and `?mockInitError=MAINTENANCE` (or `SESSION_EXPIRED` / `SESSION_INVALID`). |
| Launch params | `src/core/boot/launchParams.ts` | `token`, `lang`/`language`, `currency`, `lobbyUrl`, `bankingUrl` from the query string or the hash (hash wins, as PBF does). Only `https` links are honoured. The token goes to the backend only, never logged or stored. |

Mock latencies: Higher or Lower and Last Man Standing 150 ms, Acca Crash 80 ms. Mock servers own the wallet
and every outcome, take a seeded `random` and `latencyMs: 0` for self-checks, and are listed in
[10-TESTING-STANDARDS.md](10-TESTING-STANDARDS.md).

## Game contracts

### Shared rules (every game)

- **Calls** are methods on the game's `Api` interface. Each returns a promise.
- **Success** returns the response object. **Failure** throws `ApiError` with a string `code`.
- **The server owns** outcomes, prices, fixtures and the wallet. The client only displays them.
- **Every money-moving reply carries the new `balance`.**
- **`init()`** must return at least `{ balance, currency, stakes }` (`CoreInit`, `src/core/game/defineGame.ts`), plus the game's own fields.
- **Session errors** can come from `init`: `SESSION_INVALID`, `SESSION_EXPIRED`, `MAINTENANCE`. The core shows a blocking screen for them. Test with `?mockInitError=MAINTENANCE`.
- **Error codes shared by all games:** `INSUFFICIENT_BALANCE`, `INVALID_STAKE`.

| Shared type | Shape |
|---|---|
| `CoreInit` | `{ balance: number; currency: string; stakes: number[] }` |
| `ApiError` | `{ code: string }` (thrown, not returned) |

---

### Higher or Lower (`higherlower`)

A card is shown. You pick a market (higher or lower by n) and a stake. The server draws the next card and settles. Wins build a streak; you can cash out.

#### Calls

| Call | Request | Response |
|---|---|---|
| `init()` | none | `InitResponse` |
| `pick(roundId, market, stake)` | `roundId: string`, `market: MarketId`, `stake: number` (used only when no run is active; re-picking replaces the pick) | `PickResponse` |
| `settle(roundId)` | `roundId: string` | `SettleResponse` |
| `cashOut()` | none | `CashOutResponse` |

#### Structure

| Type | Field | Type | Meaning |
|---|---|---|---|
| `InitResponse` | `balance` | number | wallet balance |
| | `currency` | string | ISO code, for example `GBP` |
| | `stakes` | number[] | allowed stakes |
| | `round` | `RoundInfo` | the open round |
| `RoundInfo` | `id` | string | round id, sent back on `pick` and `settle` |
| | `current` | `Card` | the card to beat |
| | `markets` | `Market[]` | six markets, in the order H1 H2 H3 L1 L2 L3 |
| `Card` | `name`, `club`, `position` | string | player identity |
| | `nation` | `Nation` | `Brazil` `England` `France` `Germany` `Italy` `Portugal` `Spain` `Turkey` `Random` |
| | `ovr`, `attack`, `creativity`, `defence` | number | ratings, `ovr` decides the result |
| | `tier` | `'gold'` \| `'silver'` \| `'bronze'` | card tier |
| `Market` | `id` | `MarketId` | `H1` `H2` `H3` `L1` `L2` `L3`; Hn wins if next >= current + n, Ln if next <= current - n |
| | `label` | string | for example `Higher 2+` |
| | `price` | number | payout multiplier, `0` when not available |
| | `available` | boolean | false when the chance is too high or too low |
| `PickResponse` | `balance` | number | after the stake is taken |
| | `run` | `Run` | the active run |
| | `pick` | `MarketId` | the market now picked |
| `Run` | `stake` | number | stake of the run |
| | `value` | number | current run value |
| | `streak` | number | correct picks in a row |
| | `bonusPct` | number | streak cash-out bonus: 5 at streak 3, 10 at 4, 15 from 5 |
| | `cashValue` | number | what cash out pays now, including the bonus |
| `SettleResponse` | `next` | `Card` | the card the server drew |
| | `outcome` | `'won'` \| `'lost'` \| `'no-pick'` | result of the pick |
| | `run` | `Run` \| null | null after a loss |
| | `balance` | number | |
| | `round` | `RoundInfo` | the next round |
| `CashOutResponse` | `amount` | number | paid out |
| | `balance` | number | after the payout |

**Error codes:** `ROUND_CLOSED`, `INSUFFICIENT_BALANCE`, `MARKET_UNAVAILABLE`, `INVALID_STAKE`, `NO_RUN`, plus the session codes. The mock RTP is 0.96.

#### Example responses (captured from the mock server; players are synthetic)

`init()`

```json
{
  "balance": 1000,
  "currency": "GBP",
  "stakes": [1, 2, 5, 10, 20],
  "round": {
    "id": "r1",
    "current": {
      "name": "Kai Haddad",
      "club": "Southport",
      "position": "CAM",
      "nation": "Spain",
      "ovr": 75,
      "attack": 80,
      "creativity": 73,
      "defence": 79,
      "tier": "bronze"
    },
    "markets": [
      { "id": "H1", "label": "Higher", "available": true, "price": 1.24 },
      { "id": "H2", "label": "Higher 2+", "available": true, "price": 1.32 },
      { "id": "H3", "label": "Higher 3+", "available": true, "price": 1.41 },
      { "id": "L1", "label": "Lower", "available": true, "price": 4.96 },
      { "id": "L2", "label": "Lower 2+", "available": true, "price": 6.61 },
      { "id": "L3", "label": "Lower 3+", "available": true, "price": 9.92 }
    ]
  }
}
```

`pick('r1', 'H1', 5)`

```json
{
  "balance": 995,
  "run": { "stake": 5, "value": 5, "streak": 0, "bonusPct": 0, "cashValue": 0 },
  "pick": "H1"
}
```

`settle('r1')`

```json
{
  "next": {
    "name": "Ivan Reyes",
    "club": "River City",
    "position": "ST",
    "nation": "Germany",
    "ovr": 82,
    "attack": 84,
    "creativity": 86,
    "defence": 88,
    "tier": "silver"
  },
  "outcome": "won",
  "run": { "stake": 5, "value": 6.2, "streak": 1, "bonusPct": 0, "cashValue": 6.2 },
  "balance": 995,
  "round": {
    "id": "r2",
    "current": {
      "name": "Ivan Reyes",
      "club": "River City",
      "position": "ST",
      "nation": "Germany",
      "ovr": 82,
      "attack": 84,
      "creativity": 86,
      "defence": 88,
      "tier": "silver"
    },
    "markets": [
      { "id": "H1", "label": "Higher", "available": true, "price": 2.2 },
      { "id": "H2", "label": "Higher 2+", "available": true, "price": 2.48 },
      { "id": "H3", "label": "Higher 3+", "available": true, "price": 2.83 },
      { "id": "L1", "label": "Lower", "available": true, "price": 1.8 },
      { "id": "L2", "label": "Lower 2+", "available": true, "price": 1.98 },
      { "id": "L3", "label": "Lower 3+", "available": true, "price": 2.2 }
    ]
  }
}
```

`cashOut()`

```json
{ "amount": 6.2, "balance": 1001.2 }
```

---

### Acca Crash (`accacrash`)

A shared round: betting, then a multiplier that climbs until it crashes. Two bet panels per round. Goals by your scorer cards boost the multiplier.

#### Calls

| Call | Request | Response |
|---|---|---|
| `init()` | none | `InitResponse` |
| `placeBet(roundId, panel, stake, autoCashOut)` | `roundId: string`, `panel: 0 \| 1`, `stake: number`, `autoCashOut: number \| null` | `BetResponse` |
| `cancelBet(roundId, panel)` | `roundId: string`, `panel: 0 \| 1` | `BetResponse` |
| `start(roundId)` | `roundId: string` (mock only: the real server starts rounds on its own schedule) | `StatusResponse` |
| `status(roundId)` | `roundId: string` (poll while running, or replace with a push channel) | `StatusResponse` |
| `cashOut(roundId, panel)` | `roundId: string`, `panel: 0 \| 1` | `StatusResponse` |
| `next()` | none | `NextRoundResponse` |

#### Structure

| Type | Field | Type | Meaning |
|---|---|---|---|
| `InitResponse` | `balance`, `currency`, `stakes` | | as in the shared rules |
| | `autoOptions` | number[] | allowed auto cash-out multipliers |
| | `round` | `RoundInfo` | the open round |
| | `history` | number[] | recent crash multipliers, oldest first |
| `RoundInfo` | `id` | string | round id |
| | `cards` | `ScorerCard[]` | the scorer cards dealt this round |
| `ScorerCard` | `id`, `name`, `club` | string | player identity |
| | `nation` | `Nation` | see Higher or Lower |
| | `tier` | `'gold'` \| `'silver'` \| `'bronze'` | card tier |
| | `boost` | number | multiplier added when this player scores (bronze 0.10, silver 0.25, gold 0.50) |
| `BetResponse` | `balance` | number | |
| | `bets` | `Bet[]` | the player's bets this round |
| `Bet` | `panel` | 0 \| 1 | which bet panel |
| | `stake` | number | |
| | `autoCashOut` | number \| null | auto cash-out multiplier |
| | `status` | `'placed'` \| `'cashed'` \| `'lost'` | |
| | `cashedAt` | number \| null | multiplier it cashed at |
| | `payout` | number | 0 until cashed |
| `StatusResponse` | `elapsedMs` | number | time since the run started |
| | `multiplier` | number | current multiplier, goal boosts included |
| | `crashed` | boolean | |
| | `crashPoint` | number \| null | null until the crash, so the client never knows it early |
| | `goals` | `GoalEvent[]` | goals so far |
| | `bets` | `Bet[]` | |
| | `balance` | number | |
| `GoalEvent` | `atMs` | number | when it happened in the run |
| | `minute` | number | match minute shown to the player |
| | `scorer`, `club` | string | |
| | `mine` | boolean | true when it is one of the player's cards |
| | `boost` | number | multiplier added (0 when not mine) |
| `NextRoundResponse` | `round` | `RoundInfo` | |
| | `history` | number[] | |

**Error codes:** `ROUND_CLOSED`, `INSUFFICIENT_BALANCE`, `INVALID_STAKE`, `INVALID_AUTO`, `NO_BET`, `BET_EXISTS`, plus the session codes. The mock RTP is about 0.94 to 0.97.

#### Example responses (captured from the mock server)

`init()`

```json
{
  "balance": 1000,
  "currency": "GBP",
  "stakes": [1, 2, 5, 10, 20, 50, 100],
  "autoOptions": [1.5, 2, 3, 5, 10],
  "round": {
    "id": "r1",
    "cards": [
      { "id": "c1-0", "name": "K. Novak", "club": "River City", "nation": "Germany", "tier": "gold", "boost": 0.5 },
      { "id": "c1-1", "name": "J. Moreau", "club": "Vale Athletic", "nation": "France", "tier": "gold", "boost": 0.5 },
      { "id": "c1-2", "name": "R. Berg", "club": "Harbour Utd", "nation": "Germany", "tier": "bronze", "boost": 0.1 }
    ]
  },
  "history": []
}
```

`placeBet('r1', 0, 5, 2)`

```json
{
  "balance": 995,
  "bets": [
    { "panel": 0, "stake": 5, "autoCashOut": 2, "status": "placed", "cashedAt": null, "payout": 0 }
  ]
}
```

`start('r1')` and `status('r1')` at the start of the run

```json
{
  "elapsedMs": 0,
  "multiplier": 1,
  "crashed": false,
  "crashPoint": null,
  "goals": [],
  "bets": [
    { "panel": 0, "stake": 5, "autoCashOut": 2, "status": "placed", "cashedAt": null, "payout": 0 }
  ],
  "balance": 995
}
```

---

### Last Man Standing (`lastmanstanding`)

Pick one winning team per game week, each team once. A win moves up a 20-rung prize ladder; a draw or loss ends the game. Cash out after any survived round.

#### Calls

| Call | Request | Response |
|---|---|---|
| `init()` | none | `InitResponse` |
| `start(league, mode, stake)` | `league: 'epl' \| 'laliga' \| 'bra'`, `mode: 'easy' \| 'medium' \| 'hard'`, `stake: number` | `StartResponse` |
| `pick(gameId, code)` | `gameId: string`, `code: string` (team code, for example `ARS`) | `PickResponse` |
| `cashOut(gameId)` | `gameId: string` | `CashOutResponse` |
| `resetDemoBalance()` | none (MOCK ONLY, refused while a game is running) | `{ balance: number }` |

#### Structure

| Type | Field | Type | Meaning |
|---|---|---|---|
| `InitResponse` | `balance`, `currency`, `stakes` | | as in the shared rules |
| | `leagues` | `{ id, name }[]` | selectable leagues |
| | `modes` | `ModeInfo[]` | selectable difficulties |
| `ModeInfo` | `id`, `name`, `desc` | string | |
| | `top` | number | top prize multiplier (20th rung) |
| `StartResponse` | `balance` | number | after the stake is taken |
| | `game` | `Game` | |
| `Game` | `id`, `league`, `mode` | string | |
| | `stake` | number | |
| | `teams` | `Team[]` | the 20 clubs |
| | `schedule` | `Fixture[][]` | 38 game weeks of 10 fixtures, visible from the start |
| | `ladder` | number[] | 20 prize multipliers, priced on this fixture list |
| | `best` | number[] | exact chance of reaching each of the first rounds with best play (display only) |
| | `gap` | number[] | same chance when always backing the biggest OVR gap (display only) |
| | `gw` | number | current game week, starting at 0 |
| | `wins` | number | rounds survived |
| | `used` | string[] | team codes already picked |
| | `history` | `HistoryEntry[]` | newest first |
| | `over` | boolean | true after a loss, a cash-out or the top prize |
| `Team` | `code`, `name` | string | |
| | `ovr`, `att`, `def`, `cre` | number | club ratings |
| `Fixture` | `home`, `away` | string | team codes |
| | `probs` | [number, number, number] | chance of home win, draw, away win; sums to 1 |
| `HistoryEntry` | `gw` | number | game week, starting at 1 |
| | `code` | string | team picked |
| | `score` | string | for example `2-1 v LEE` (`v` home, `at` away) |
| | `won` | boolean | |
| | `outcome` | `'H'` \| `'D'` \| `'A'` | result of the match |
| `PickResponse` | `balance` | number | |
| | `game` | `Game` | updated game |
| | `mine` | string | team code that was picked |
| | `won` | boolean | |
| | `results` | `MatchResult[]` | all 10 matches of the game week |
| | `payout` | number | non-zero only when the final round is won |
| `MatchResult` | `home`, `away` | string | team codes |
| | `outcome` | `'H'` \| `'D'` \| `'A'` | |
| | `homeGoals`, `awayGoals` | number | |
| | `goals` | `Goal[]` | in minute order |
| | `chances` | `Chance[]` | near misses for the match view |
| `Goal` | `m` | number | minute |
| | `s` | `'h'` \| `'a'` | scoring side |
| | `who` | string \| null | scorer, null when unknown |
| `Chance` | same fields as `Goal`, plus `how` | string | `saved`, `wide`, `off the bar` or `blocked` |
| `CashOutResponse` | `balance` | number | after the payout |
| | `game` | `Game` | |
| | `amount` | number | paid out |

**Error codes:** `INSUFFICIENT_BALANCE`, `INVALID_STAKE`, `INVALID_LEAGUE`, `INVALID_MODE`, `GAME_ACTIVE`, `NO_GAME`, `GAME_OVER`, `UNKNOWN_TEAM`, `TEAM_USED`, `CANNOT_CASH_OUT`, plus the session codes.

**Rules:** the stake is taken at `start`. A loss pays nothing, so the balance does not change on a loss. `pick` plays the whole game week. The mock start balance is 100, the stakes are 1, 2, 5 and 10, and the round-1 return is about 0.95.

#### Example responses (captured from the mock server; long lists are shortened and marked)

`init()`

```json
{
  "balance": 100,
  "currency": "GBP",
  "stakes": [1, 2, 5, 10],
  "leagues": [
    { "id": "epl", "name": "Premier League" },
    { "id": "laliga", "name": "La Liga" },
    { "id": "bra", "name": "Brasileirão" }
  ],
  "modes": [
    { "id": "easy", "name": "Easy", "desc": "Kinder fixtures early on", "top": 25000 },
    { "id": "medium", "name": "Medium", "desc": "A mixed start", "top": 50000 },
    { "id": "hard", "name": "Hard", "desc": "Tight fixtures early on", "top": 100000 }
  ]
}
```

`start('epl', 'medium', 5)`

```json
{
  "balance": 95,
  "game": {
    "id": "lms-1",
    "league": "epl",
    "mode": "medium",
    "stake": 5,
    "teams": [
      { "code": "ARS", "name": "Arsenal", "ovr": 88, "att": 88, "def": 91, "cre": 87 },
      { "code": "MCI", "name": "Man City", "ovr": 87, "att": 87, "def": 87, "cre": 87 }
    ],
    "schedule": [
      [
        {
          "home": "BHA",
          "away": "NEW",
          "probs": [0.327, 0.235, 0.438]
        },
        {
          "home": "MCI",
          "away": "BOU",
          "probs": [0.676, 0.17, 0.154]
        }
      ],
      "... 37 more weeks"
    ],
    "ladder": [1.26, 1.83, 2.82, 4.63, "... 16 more"],
    "best": [0.751, 0.519, 0.336],
    "gap": [0.751, 0.519, 0.336],
    "gw": 0,
    "wins": 0,
    "used": [],
    "history": [],
    "over": false
  }
}
```

`pick('lms-1', 'BHA')` (a loss in this capture)

```json
{
  "balance": 95,
  "mine": "BHA",
  "won": false,
  "payout": 0,
  "results": [
    {
      "home": "BHA",
      "away": "NEW",
      "outcome": "A",
      "homeGoals": 0,
      "awayGoals": 3,
      "goals": [
        { "m": 33, "s": "a", "who": "Gonzalez" },
        { "m": 45, "s": "a", "who": "Wissa" }
      ],
      "chances": [
        { "m": 36, "s": "a", "who": "Wissa", "how": "blocked" }
      ]
    },
    "... 9 more matches"
  ],
  "game": {
    "id": "lms-1",
    "league": "epl",
    "mode": "medium",
    "stake": 5,
    "teams": "... 20 teams",
    "schedule": "... 38 weeks",
    "ladder": "... 20",
    "best": "...",
    "gap": "...",
    "gw": 0,
    "wins": 0,
    "used": ["BHA"],
    "history": [
      { "gw": 1, "code": "BHA", "score": "0-3 v NEW", "won": false, "outcome": "A" }
    ],
    "over": true
  }
}
```


## Open points before the real backend

| Point | Why it matters |
|---|---|
| Init is only `CoreInit` today | The PBF init (section "PBF platform reference") also returns `minBet`, `maxBet`, `maxPayOut`, `currencyDecimals`, `lobbyUrl`, `bankingUrl`, `isUnderMaintenance` and more that the real init returns |
| String error codes only | The real backend sends numeric codes (2420, 2436, 2449, 60000); a mapper is needed |
| No idempotency key | `placeBet`, `pick`, `settle`, `cashOut` and `start` could double charge or pay on a retry |
| Mock-only calls | `resetDemoBalance` and Acca Crash `start` have no real equivalent |
| Large Last Man Standing replies | Every `start` and `pick` carries the full schedule; send it once and return only changes |
| No resume | Last Man Standing init cannot return a running game |
| Money format | Plain numbers today; agree decimal strings or minor units |

## PBF platform reference

Facts about the real PBF platform, taken from the audit of the existing Ultimate Soccer integration (the
original game in the separate PBF repository). They describe what a real client must handle; none of it
is implemented in this framework yet. Full detail: [archive/plans-and-audits/](archive/plans-and-audits/)
(the original audit, backend and round lifecycle, risks and security).

**Transports.** GraphQL over HTTP with `Authorization: Bearer <beToken>`; Socket.io with
`auth: { token: beToken }`, 5 reconnects (max 10 s), PING every 5 s, PONG timeout 3 s; a network popup
after 4 s disconnected. One session and one socket per page.

**Token flow.** The operator token arrives in the parent window URL hash (standalone: the page URL).
`Init(token)` returns `beToken` for later calls. There is no refresh and no expiry handling; code 2300
(session expired) only shows a message. Tokens are never stored or logged.

**Init core fields** (every game): `balance`, `pbfCoin`, `currency`, `currencyLang`,
`currencyUseGrouping`, `currencyDecimals`, `minBet`, `maxBet`, `maxPayOut`, `language`,
`countryCode`, `lobbyUrl`, `bankingUrl`, `platformStrategy`, `gameAlias`, `isUnderMaintenance`,
`underMaintenanceTitle`, `creditPending`, `blockMatchOnPendingCredit`, `notifyOnCreditFailure`,
`useAnalytics`, `showRtpGameRules`, `showOpenCloseBalance`, `showWinLoss`, plus platform ids and
`beToken`. Must be null-safe: `currencyDecimals` (derive from currency), `lobbyUrl` / `bankingUrl`
(hide the buttons). The framework's `CoreInit` covers only `balance`, `currency`, `stakes` today.

**Error codes.** 2420, 2436, 2449: init error; 60000: maintenance; 2300: session expired. The original game
has two different error tables (shell and canvas) that disagree; a merged table needs a product decision.

**Push events** (socket): `USER_BALANCE_UPDATE`, `CREDIT_PENDING_UPDATE`, `SHOW_POPUP` (`VOID_BET`,
`CREDIT_DELAYED`), `UNDER_MAINTENANCE`. Credit pending blocks the next round; void and refund arrive as
popups and in bet history; a running round resumes from the init's last-round status.

**Operators.** Platform strategies: own shell, Games Global, GameFlex, Aristocrat. GameFlex and Aristocrat
post messages to the parent and the grandparent; a page without the original iframe needs one hop. Measured
message counts in the original: own shell 54, Games Global 21, GameFlex 7, Aristocrat 9; every sender uses
target `'*'`. Operator tests (OP1 to OP6) must pass before any operator integration changes.

**What new games need from the backend** (none of it exists yet):

| Need | Acca Crash | Higher or Lower | Last Man Standing |
|---|---|---|---|
| Rounds | shared timed rounds | per round | per-user run |
| Bet | 2 panels | market + stake | stake + pick |
| Cash out | yes, timing-critical | yes | yes |
| Auto cash out | yes | no | no |
| Result | crash point, goals, scorers | next card | match results |
| Push | tick, crowd, crash | feed | none |
| Maths owner (prototype figure) | RTP 97% | 0.96 | ladder 95% |

## Security rules and findings

Rules for this framework: no token, credential or secret in code, fixtures or docs; the token is sent to the
backend only; fixtures are synthetic; message listeners must check the origin when operator messaging is
added.

Findings in the original PBF game (separate repository; need owner action, not fixed here): a shared dev
`beToken` with an expiry of about 114 years must be treated as compromised and rotated (S0); a hard-coded
fallback operator token in the wrapper source must be removed and rotated (S1); the init response including
`beToken` is posted with target `'*'` (S2); message listeners have no origin check (S3); the demo launch
has no production gate (S4); no token refresh (S5); the socket is exposed on `window` (S7).

## Open questions

| ID | Question |
|---|---|
| Q1 | Who owns the backend contracts for Acca Crash, Higher or Lower and Last Man Standing, and when (round, bet, cash out, result, push)? The critical path for going live. |
| Q5 | Merged error-code table: which message wins when the two original tables disagree? |
| Q6 | Should a shell receive `beToken` from the game, or authenticate separately? |
| Q9 | Acca Crash: shared rounds (everyone sees the same crash) or per-user rounds? Decides the socket design. |
| Q10 | Which operators must each new game support at launch? |
