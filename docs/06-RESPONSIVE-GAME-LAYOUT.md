# 06. Responsive game layout

Requirement 4 in [02-CORE-REQUIREMENTS.md](02-CORE-REQUIREMENTS.md): the game and its essential controls
fit together in about half of a mobile screen, with no scrolling to reach controls, and everything else
(rules, history, live feeds) in its own scrolling section. This doc covers the app frame, the shared
layout, how each game uses it, the test results and what is left.

## App frame

`src/core/ui/AppShell.tsx` + `styles.css` (`.app-shell`, `.app-frame`), same sizing rules as PBF's own
shell: on desktop a centred phone-width column, `45vh` wide (`55vh` when the window is under 780 px tall),
at most 480 px, over the desktop background (loaded after playable, see doc 05); full width at 768 px and
below and on landscape phones (height under 540 px). Pixi stages are transparent so the PBF gradient shows
through. The frame carries no product logo: it is shared by every game on the framework.

## Audit (before)

| Game | Structure | Problems |
|---|---|---|
| Higher or Lower | One long column: header, last cards, banner, run ladder, card canvas, stake, markets, live feed | Markets at 93 to 96% of a phone screen, below the fold at 320x568 (133%); info sits between game and controls |
| Acca Crash | Header, history, curve canvas, tier legend, scorer cards, ticker, two stacked bet panels, crowd list | Second bet panel below the fold on every phone (100 to 146%); panels stacked vertically under 400 px |
| Last Man Standing | Long column per screen (setup, play, match, banked) with rules text above the controls | Start button at 83 to 139%; on the play screen the lock bar was a sticky bar over a long page |
| All | `.app-frame` was the scroll container; canvas height from a share of the window height (`dvh`) | Landscape phones blocked by a "rotate your device" overlay; frame 214 px wide in landscape; sizes followed the window, not an embedding container |

Shared duplicated patterns found: every game repeated a header + stage + controls + "more stuff" column,
stake chips sized differently per game, and each canvas height was set independently from the window.

## Foundation (shared)

| Part | File | What it does |
|---|---|---|
| `GameLayout` | `src/core/ui/GameLayout.tsx` | Slots: `header`, `stage`, `controls`, `info`, `overlays`. The first three form the playable unit. |
| Layout CSS | `src/styles.css` "game layout" | Playable unit height `min(100% of frame, max(--pbf-play-min, --pbf-play-share % of frame))`; info fills the rest and scrolls on its own (`--pbf-info-min`, default 96 px); landscape switches to stage left, header + controls + info right. Compact header and one-row stake chips inside the playable unit. |
| Frame as size container | `.app-frame` (`container: pbf-frame / size`) | Everything sizes from the frame, not the window: works standalone, in an operator iframe, and in an operator element (set `--pbf-host-height`). Full width on landscape phones; rotate overlay removed. |
| `CanvasFrame fill` | `src/core/pixi/CanvasFrame.tsx` | Canvas fills the stage slot instead of a share of the window. |
| `PixiStage` resize | `src/core/pixi/PixiStage.tsx` | `ResizeObserver` on the host box calls `app.queueResize()`: same Application, no re-init, when the slot changes size without a window resize. |

Rules for games:
- Put only what is needed to play in `header`, `stage` and `controls`; everything else in `info`.
- Set `--pbf-play-min` to the smallest height the game's design can play in (and `--pbf-play-share`
  if 50% is not right). The stage takes whatever height is left.
- A DOM stage that is longer than its slot scrolls inside the game area; controls never move.
- Use container queries (`pbf-frame`, or a container on the stage) for size-dependent details, never
  the window size.

## Per game

| Game | `--pbf-play-min` | Header | Stage | Controls | Info |
|---|---|---|---|---|---|
| Higher or Lower | 380 px | title, balance, round banner with countdown | card reveal canvas (labels shown when the stage is at least 230 px tall) | stake chips or cash-out (with streak), 6 markets | last cards, run ladder, live feed |
| Acca Crash | 440 px | title, balance, crash history | curve canvas + scorer cards | two bet panels side by side (quick-stake chips shown when a panel is at least 200 px wide) | ticker, tier boosts, other players' bets |
| Last Man Standing | 400 px | title, balance (+ round, cash-out, win stats on the play screen) | setup: league and difficulty; play: this week's fixtures (scroll inside the stage); match: score board and pitch | setup: stakes + start; play: pick summary, cash out, play game week; match: verdict + next actions | rules, top prize, prize ladder, fixture planner, teams, match events, other results, guide |

Gameplay, game logic, mocks and Pixi scenes are unchanged; only where things are placed and their compact
sizes changed.

## Test results

Measured in Chromium (Playwright) with mobile emulation at device scale 2 (desktop at 1); "controls
bottom" = lowest edge of the essential controls (bet/market/start buttons, stake chips, canvas, balance)
as a share of the screen height. Before = previous build, after = this build. Screenshots:
[archive/compact-layout-screenshots/before/](archive/compact-layout-screenshots/before/) and [archive/compact-layout-screenshots/after/](archive/compact-layout-screenshots/after/) (`<game>-<size>.jpg`; a representative subset: 390x844, 320x568, landscape 844x390 and the 360x420 embed per game).

| Size | HL before | HL after | Acca before | Acca after | LMS before | LMS after |
|---|---:|---:|---:|---:|---:|---:|
| 320x568 | 133% | **65%** | 146% | **75%** | 139% | **69%** |
| 360x800 | 96% | **49%** | 104% | **53%** | 91% | **49%** |
| 390x844 | 93% | **49%** | 100% | **50%** | 83% | **49%** |
| 430x932 | 87% | **49%** | 74% | **48%** | 71% | **49%** |
| Landscape 844x390 | rotate overlay | **98%, all visible** | rotate overlay | **80%** | rotate overlay | **31%** |
| Landscape 667x375 | rotate overlay | **98%** | rotate overlay | **79%** | rotate overlay | **32%** |
| Desktop 1280x800 | 96% | **49%** | 104% | **53%** | 91% | **49%** |
| Embedded 360x420 | 174% | **89%** | 188% | **96%** | 172% | **93%** |
| Embedded 300x480 | 168% | **78%** | 173% | **88%** | 173% | **82%** |

In landscape and small embeds the playable unit uses the full height on purpose (it cannot fit in half);
all essential controls are visible in every case after, against none of the small sizes before.

Also checked (after):
- No horizontal overflow at any size; no console errors or page errors.
- In-round states at 390x844, 320x568 and landscape 844x390: Higher or Lower after a pick and reveal
  (markets and result stamp visible), Acca Crash running with the cash-out button visible, Last Man
  Standing play screen (lock bar visible, fixtures scroll inside the stage) and match result (verdict
  actions visible). Screenshots at 390x844: `*-result-*`, `*-running-*`, `*-play-*`.
- Resize without re-init: Higher or Lower and Acca Crash resized 844x390, 320x568, 430x932, 390x844 in one
  page: always one canvas, the same element, drawing buffer following the new size.
- Operator element embed: with `--pbf-host-height: 420px` on a 390x844 page, all three games keep their
  controls inside the 420 px box (`archive/compact-layout-screenshots/after/accacrash-hostbox-390x420.jpg`).
- Typecheck, lint, all self-checks and the production build pass.

Not tested: real iOS Safari or Android devices (Chromium emulation only), right-to-left, browser zoom
levels, very large tablets in portrait beyond the desktop column.

## Remaining game-specific layout issues

1. **Higher or Lower** needs 380 px, so it takes 65% at 320x568 and most of a small embed; the cards are
   small there (canvas 125 px tall). A smaller market grid (2 rows of 3 at 40 px) or a one-row Higher/Lower
   toggle would bring it to 50%.
2. **Acca Crash** needs 440 px (52 to 55% on 360 to 390 px phones): two full bet panels are the limit. On
   phones the quick-stake chips are hidden (the stepper still reaches every stake); scorer names truncate
   on narrow cards ("O. KA..."); the empty crash-history row takes space before the first round.
3. **Last Man Standing** play screen: ten fixtures cannot fit, so they scroll inside the stage while the
   lock bar stays fixed. A compact one-line fixture row is a design task. "Cash out after R1" wraps to two
   lines at 320 px. The planner moved from a tab next to the fixtures into the info section.
4. **Last Man Standing** setup and match screens leave unused space in the stage on tall phones.
5. **Text changes from compaction**: Higher or Lower's "No pick this round" line now shows the player's
   position and club during betting; "Current player / Next player" became "Current / Next" and hides on
   short stages.
6. **Intro and tutorial overlays** still cover the whole frame (unchanged); in landscape the Higher or
   Lower tutorial card covers the controls until dismissed.
7. **Desktop** keeps the phone-width column; a wide layout with a side panel (see 02-CORE-REQUIREMENTS.md, pending work) is not part of this
   phase.

## How to use it in a new game

```tsx
return (
  <GameLayout
    className="mygame"                 // set --pbf-play-min on .mygame in the game CSS
    header={<GameHeader title="My Game" balance={balance} currency={currency} />}
    stage={<CanvasFrame config={view.canvas} fill>...<PixiStage critical .../></CanvasFrame>}
    controls={<>...stake, bet, cash out...</>}
    info={<>...rules, history, feed...</>}
    overlays={showIntro && <Intro />}
  />
);
```
