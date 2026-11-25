# 09. One-sweep development roadmap (React-first)

Revision 2, 2026-11-23. Replaces the canvas-first roadmap.
Two tracks run side by side:
- **Track T (target):** build the React-first framework and the new games.
- **Track L (legacy and migration):** keep Ultimate Soccer (US) and operator integrations safe, then migrate only when it pays off.

Every phase goes through the normal branch flow (`dev` -> `staging` -> `demo-site` -> `main`), never edits `public/version.txt`, and keeps US behaviour identical unless a change is explicitly approved. Test IDs refer to doc 08.

## Dependency order
```
P0 ─► P1 ─► P2 ─┬─► P3 ─► P5 ─► P7 (production readiness)
                └─► P4 ─┘
P0 ─► P6 (operator validation)   ─► P8 (US migration, optional and incremental)
P5 also needs: backend contracts for new games (Q1)
```

---
## P0: Baseline and decisions (Track L + T)
- **Tasks:** baseline scripts for GraphQL operations, legacy bridge messages, socket events, US asset URLs, build layout; operator harness capturing outbound/inbound messages per platform strategy (OP1); record a full US round network log; decide Q1 to Q10 (doc 10); approve Vitest, React Testing Library, Playwright.
- **Files:** new `tools/baseline/*`, `tests/harness/operator.html`.
- **Done when:** baselines reproducible; decisions recorded.
- **Tests:** US1 to US3, US8, OP1 captured.
- **Risks:** no existing tests; the baseline is the safety net.

## P1: React framework foundation (Track T, with US re-hosting)
- **Tasks:** create `src/app` and `src/framework/{contract,ui,state}`; route registry; hosts (drawer, modal, popup); core store + game slices; move US shell pages, drawers, modals, store and session fields into `src/games/ultimate-soccer` and `framework/*` as pure moves; `PixiContainer` becomes `framework/legacy/LegacyCanvasFrame` with a typed `legacyProtocol` and one origin-checked `legacyBridge` (replacing the copied `_transferInfoToPixi` helpers).
- **Files:** `src/App.tsx`, `src/router/*`, `src/components/**`, `src/pages/**`, `src/store/gameStore.ts`, `src/service/sessionHelper.ts`, `src/util/miscUtils.ts`, `src/pages/home/Home.tsx`, new `src/app/**`, `src/framework/**`.
- **Prerequisites:** P0.
- **Done when:** US1 to US9 equal to baseline; RF1, RF3, RF4 pass.
- **Risks:** large moves hide logic changes; moves and edits in separate PRs.

## P2: PixiStage and scene contract (Track T)
- **Tasks:** `framework/pixi/{PixiStage.tsx, scene.ts, stageAssets.ts, FxLayer.tsx, view/index.ts, devtools.ts}`; per-mount Application lifecycle (no shared app); build one spike scene (Higher or Lower card reveal) driven by synthetic props; run V1 to V8.
- **Prerequisites:** P1.
- **Deliverables:** lifecycle report with V results and a go/no-go on per-mount Applications.
- **Done when:** V1, V2, V4, V5, V6, V7 pass, or a separate approved context-reuse change is scoped.
- **Risks:** iOS context limits; FX layer overlapping a stage.

## P3: Services (Track T)
- **Tasks:** `services/api` (Apollo client, error link, single error map, response guards), `services/session` (operator token, `Init` core subset, `beToken` in memory, gated demo launch), `services/socket`, `services/round` (phase machine), `services/bet` (place, cancel, cash out, auto cash out, numeric limits, money), `services/audio`, `services/errors`, `services/logger`, `services/wrappers` (operator adapters for the app window).
- **Prerequisites:** P1.
- **Done when:** SV1 to SV9, RF6, RF7 pass with mocked transports.
- **Risks:** the new-game wrappers must match operator baselines (P6); error map conflicts need product decisions (Q5).

## P4: Assets (Track T)
- **Tasks:** export UI images for reusable components from `canvas/src_assets` into `framework/ui/assets` (Vite-hashed); stage asset manifests for new games under `canvas/assets/games/<id>/`; reuse PBF atlases and Spine from `canvas/assets` by name; `tools/validate-assets.mjs`.
- **Prerequisites:** P2.
- **Done when:** AS1, AS3, AS4, AS5, AS6 pass; US asset URLs unchanged (AS2).
- **Risks:** art export effort; unreferenced atlases (about 7.6 MB) not deleted without art sign-off.

## P5: First new game end to end (Track T)
- **Tasks:** Higher or Lower on the framework: React screens (lobby entry, game screen, history, leaderboards), card reveal scene, round definition, api module over its real backend operations, game slice, content. Then Acca Crash (crash stage scene + bet panels), then Last Man Standing (mostly React, match-sim scene).
- **Prerequisites:** P2, P3, P4, backend contracts (Q1), operator validation for the target platform strategies (P6).
- **Done when:** sections 1 to 6 and 8, 9 of doc 08 pass for that game; no `framework/` edits needed to add the second game.
- **Risks:** backend contract delays; mitigated by building against agreed schemas, never by shipping client maths.

## P6: Operator integration validation (Track L, gate)
- **Tasks:** run OP2 to OP5 for a React-first page against the baselines; resolve the parent vs grandparent hop difference per platform strategy; OP6 staging runs with each operator.
- **Prerequisites:** P0, P3 (wrappers).
- **Done when:** OP1 to OP6 pass for every strategy a new game launches with.
- **Risks:** operator certification windows; schedule early.

## P7: Production readiness (Track T)
- **Tasks:** CI with unit, component, e2e and boundary checks; performance runs (SC6, PF1 to PF4); security items SE1 to SE5 and doc 10 S1 to S4 closed as approved changes; deploy verification on dev and staging; docs (`CLAUDE.md`, new-game guide, scene authoring guide).
- **Done when:** all P1 tests green, security sign-off, staging soak complete.

## P8: Ultimate Soccer incremental migration (Track L, optional)
- **Rule:** no forced rewrite. A US screen moves to React only when it needs substantial work anyway (new feature, redesign, recurring bugs). Gameplay surfaces (match simulation, pack opening, vault wheel, penalty) become Pixi scenes when touched.
- **Per screen:** build React screen or Pixi scene on the framework, switch the route, keep the legacy path behind a flag until US10 passes, then remove the legacy screen.
- **Iframe removal (M4):** only when no US screen remains in the legacy canvas, OP1 to OP6 pass, and US1 to US9 pass. Then remove the canvas entry from `vite.config.mjs` and retire `src/graphql/canvas`.
- **Risks:** long-lived dual paths; track remaining legacy screens on a visible list.

## Mapping to migration stages (doc 03 Part B)
| Stage | Phases |
|---|---|
| M0 Baseline | P0 |
| M1 Framework in place | P1 |
| M2 New games | P2, P3, P4, P5, P6, P7 |
| M3 US incremental moves | P8 (per screen) |
| M4 Iframe removal for US | P8 end gate |

## Relative effort (refine in P0)
| Phase | Size |
|---|---|
| P0 | S |
| P1 | M |
| P2 | S to M |
| P3 | M |
| P4 | S to M |
| P5 | L per game (plus backend dependency) |
| P6 | M (operator scheduling) |
| P7 | M |
| P8 | Ongoing, per screen |
