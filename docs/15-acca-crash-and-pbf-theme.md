# 15. Acca Crash (mock backend) and the PBF theme

Date: 2026-11-23. PBF project untouched.

## Acca Crash
| File | Purpose |
|---|---|
| `src/games/acca-crash/api/types.ts` | Contract: `init`, `placeBet`, `cancelBet`, `start`, `status`, `cashOut`, `next`; bets, goals, scorer cards, error codes |
| `src/games/acca-crash/api/mockData.ts` | **Mock**: synthetic clubs and scorers; boost per tier (bronze 0.10, silver 0.25, gold 0.50) |
| `src/games/acca-crash/api/mockServer.ts` | **Mock backend**: crash point with P(M >= x) = 0.96 / x, multiplier e^(0.06 t) plus capped goal boosts (boosts change when M is reached, never M), auto and manual cash-outs settled by the server, wallet, validation |
| `src/games/acca-crash/scenes/CrashCurveScene.ts` | Pixi: curve, big multiplier, goal-boost total, crash state, goal flash |
| `src/games/acca-crash/AccaCrashScreen.tsx` + `accaCrash.css` | React: header with BTTS/LIVE pills, history pills, tier boost row, scorer cards, goal ticker, two bet panels (AUTO toggle + target, stake stepper, quick chips, Bet / Cancel / Cash out / Wait) |

Round loop: betting 5 s -> running (server polled every 100 ms; ends when the server reports the crash) -> ended 3 s -> next round.

Checks: `npm run check` passes (P(M>=2) 0.480; boosts never pass M; auto pays exactly its target; cancel refunds; manual cash-out uses the server multiplier and is rejected after the crash; simulated return 0.942 over 40,000 bets, within tolerance for the high-variance 5x panel). Chrome play-test: manual cash-out paid 1.27x (button showed 1.26x; server decides), auto at 2x paid exactly 2.00x before a 2.34x crash, balances matched.

## PBF theme (shared)
- `src/styles.css`: design tokens copied from the Playbook Fusion design system used by the prototypes (palette, semantic surfaces and text, radii, shadows, easing), PBF's own Degular and Avenir Next fonts (`public/assets/common/fonts`, copied from PBF), and shared classes: `pbf-screen`, `pbf-header`, `pbf-title`, `pbf-eyebrow`, `pbf-balance`, `pbf-caption`, `pbf-pill`, `pbf-card`, `pbf-btn` (primary, secondary, coin), stake chips, game switcher.
- `src/core/ui/GameHeader.tsx`: PLAYBOOK eyebrow, uppercase display title with optional pills, purple balance pill.
- `src/core/ui/StakeChips.tsx`: shared by both games (moved down when the second game needed it).
- Both screens follow the prototypes' layout (verified side by side in Chrome); Pixi stages are transparent so the PBF gradient shows through.
- `src/App.tsx`: game list (`#higher-lower`, `#acca-crash`); `#spike` keeps the lifecycle page.
- `src/core/ui/AppShell.tsx` + `.app-shell` / `.app-frame` CSS: same rules as PBF's AppShell. Desktop shows only the mobile layout in a centred column 45vh wide (55vh when the window is under 780px tall), max 480px, with PBF's `desktopBg.png` covering both sides; under 768px wide the frame is full width; phones in landscape (500 to 940px wide) get a rotate message. Pure CSS, no resize listeners. Verified: 2560x1271 desktop gives a 480px frame; 375x812 phone gives a full-width frame, no logo, no horizontal scroll.

## Not built or different from the prototypes
- No sound or settings buttons yet (no audio service); they are omitted rather than shown as dead buttons.
- No community "All bets / Previous / Top" table and no simulated crowd (needs a real feed).
- No stadium background image or jersey art; tier gradients and PBF badge sprites are used instead.
- Prototype splash/onboarding screens not built.
- Font URLs are root-absolute (`/assets/...`); serving the build from a sub-path needs them made relative.
- `public/_proto/` holds the three prototypes for side-by-side comparison (git-ignored, dev only).
