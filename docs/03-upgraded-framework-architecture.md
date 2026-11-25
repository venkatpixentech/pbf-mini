# 03. Upgraded framework architecture (React-first)

Revision 2, 2026-11-23. Replaces revision 1 (canvas-first engine). Approved direction:
> React is the application framework. PixiJS is a specialized rendering engine, not a second UI framework.

This document has two parts that must not be confused:
- **Part A: Target architecture.** What every new game is built on.
- **Part B: Migration strategy.** How we get there without breaking Ultimate Soccer (US) or operator integrations.

---
# Part A: Target architecture

## A1. Principles (approved)
1. React owns routing, screens, UI, state, API calls and interactions.
2. PixiJS owns gameplay rendering and graphics-heavy animations only.
3. CSS and GSAP handle normal UI animation.
4. Pixi scenes are independent, reusable and strongly typed.
5. Ultimate Soccer is preserved without a forced rewrite.
6. Existing operator integrations are kept, and messaging is validated before any iframe is removed.

## A2. Decisions
| Decision | Choice | Reason |
|---|---|---|
| App framework | React 18.3.1 + Vite + TypeScript, npm | Current stack; no React 19 upgrade |
| Rendering engine | PixiJS 8, imperative scene classes behind one reusable React component | Fits per-frame gameplay; no `@pixi/react` (needs React 19) |
| Pixi lifecycle | Each `<PixiStage>` mount creates and destroys its own Pixi Application. No shared application across games or screens by default | Simplest, isolated, no hidden global state. Context reuse is an optimization adopted only if validation tests V1 to V8 (doc 08) show a need |
| Data | One Apollo client for all new code, usable from components and services (`client.query/mutate`) | Removes the dual-client split for new games |
| State | Zustand: one core store plus per-game slices | Already used |
| UI motion | CSS transitions, GSAP for sequences | Already in dependencies |
| Outcomes | Server-authoritative only | Integrity and regulation |
| Assets | PBF assets reused. Pixi atlases and Spine stay in the existing canvas asset tree; UI images become individual files bundled by Vite | User requirement; React cannot use Pixi atlases directly |
| Repo | Single repo; `src/app`, `src/framework`, `src/games/<id>`; legacy US canvas stays in `src/canvas` | No package split or tooling migration |

## A3. Layers
```
+--------------------------------------------------------------------------+
| src/app            React root: providers, router, AppShell, route registry |
+--------------------------------------------------------------------------+
| src/games/<id>     screens (React) | scenes (Pixi) | config | api | content |
+--------------------------------------------------------------------------+
| src/framework                                                              |
|  ui/        design-system primitives, hosts (drawer, modal, popup, toast)  |
|  state/     core store, game slice registration                            |
|  services/  session | api | socket | round | bet | audio | wrappers |      |
|             analytics | i18n | errors | logger                             |
|  pixi/      PixiStage, scene contract, stage asset loader, spine, FX layer |
|  contract/  GameDefinition, ConfigSchema, validation                       |
|  legacy/    LegacyCanvasFrame + typed legacy bridge (Ultimate Soccer)      |
+--------------------------------------------------------------------------+
```
Import rules (ESLint `no-restricted-imports` + `tools/check-boundaries.mjs`):
- `framework/**` never imports `games/**` or `app/**`.
- `games/<a>/**` never imports `games/<b>/**`.
- Pixi scenes (`games/*/scenes/**`, `framework/pixi/**`) never import React, stores, Apollo or services. They receive data through props and report through typed events.
- React code never imports Pixi classes directly; it uses `<PixiStage>` with a scene factory.
- `src/canvas/**` (legacy US) is not imported by new code, except `framework/pixi/view` re-exporting the existing `corelib/pixiwrapper` classes (shared source, no copy).

## A4. React side
| Area | Responsibility | Module |
|---|---|---|
| Routing | Route registry per game; lobby and game routes; deep links | `app/router` |
| Screens | Every non-gameplay screen: home, hub, store, team, leagues, challenges, settings, history | `games/<id>/screens` |
| UI kit | Buttons, typography, tabs, accordion, keypad, stake input, balance and win display, loaders | `framework/ui` |
| Hosts | Drawer, modal, popup (error, network, maintenance), toast; registry-driven | `framework/ui/hosts` |
| State | Core: session snapshot, balance, settings, connectivity. Game slices registered by each game | `framework/state` |
| Session | Operator token, `Init`, `beToken` in memory, socket connect | `framework/services/session` |
| API | Apollo client, auth link, request-id error link, one error map, response guards | `framework/services/api` |
| Socket | socket.io client, heartbeat, typed events | `framework/services/socket` |
| Round | Phase machine (phases, timers, server-driven transitions, resume) | `framework/services/round` |
| Bet | Place, cancel, cash out, auto cash out, numeric limit checks, money formatting | `framework/services/bet` |
| Audio | One Howler service, music and SFX buses, mute on hidden | `framework/services/audio` |
| Wrappers | Operator messaging for the platform strategies in use (own shell parent, Games Global, GameFlex, Aristocrat) | `framework/services/wrappers` |
| Analytics, i18n | Existing Firebase + backend fallback; i18next | `framework/services/*` |

## A5. Pixi side
### A5.1 `<PixiStage>` (reusable React component)
- **Owns:** creating the Pixi Application on mount, attaching its canvas to a React-owned element, resize via `ResizeObserver`, DPR cap 2, pause on `visibilitychange`, WebGL context-loss handling (raised through `onError`), asset loading for the scene, and full teardown on unmount (`app.destroy` with children, textures loaded for this stage only, ticker stopped).
- **Props:** `scene` (factory), `props` (typed scene input), `assets` (stage manifest), `onEvent` (typed scene output), `onError?` (context loss, asset failure; the screen forwards it to the errors service), `transparent?`, `paused?`.
- **Does not:** fetch data, route, read stores, or keep anything global between mounts.
- **Built with:** `useRef` + `useLayoutEffect` (React 18; no ref-callback cleanup).

### A5.2 Scene contract
```ts
interface PixiScene<P, E extends SceneEvent> {
  init(ctx: SceneContext): Promise<void>; // app, stage container, loaded assets, emit(e: E)
  update(props: P): void;                 // called when React props change
  resize(w: number, h: number): void;
  destroy(): void;                        // remove listeners, tweens, timers
}
type SceneFactory<P, E> = () => PixiScene<P, E>;
```
Rules: one scene = one gameplay surface or one effect; scenes are deterministic from props plus server data; no `window` globals; every listener and tween registered through the scene context so `destroy` removes it.

### A5.3 FX layer
`<FxLayer>` is a `<PixiStage>` with `transparent` set, rendered in a portal above the React UI only while an effect plays (win celebration, pack opening, fireworks). It mounts on demand and unmounts after the effect, so no canvas stays alive when idle.

### A5.4 When to use Pixi
| Use Pixi | Use React + CSS/GSAP |
|---|---|
| Per-frame updates (match sim, crash curve, timers drawn on stage) | Navigation, screens, panels, drawers |
| Many animated objects, particles, filters | Lists, tables, forms, scrolling |
| Spine skeletons, sprite-sheet animation | Text-heavy content, localization |
| Card reveal and pack opening sequences | Popups, toasts, settings |
| Effects layered over UI (celebrations) | Simple fades, slides, counters |

## A6. Game definition (React-first)
```ts
interface GameDefinition {
  id: string; version: string;
  routes: RouteDef[];                 // React screens
  scenes: Record<string, SceneFactory<any, any>>;
  config: ConfigSchemaValues;
  stageAssets: StageAssetPack;        // Pixi atlases, spine, sounds for scenes
  round?: RoundDefinition;
  api: GameApi;                       // typed functions over Apollo documents
  state?: GameSliceFactory;
  features?: FeatureModule[];
  content: ContentKeys;
}
```

## A7. Non-goals
- Rewriting Ultimate Soccer screens to React as a precondition.
- A shared Pixi application, scene manager or Pixi-based UI kit for new games.
- Changing any backend operation, socket event, token flow or operator message.
- Client-side outcome generation.

---
# Part B: Migration strategy

## B1. Starting point
US today: React shell + one iframe hosting a large Pixi app that also draws most screens (doc 01). Its canvas engine has game code leaks, but it works and is live.

## B2. Strategy: strangler, not rewrite
| Stage | What changes | US behaviour |
|---|---|---|
| M0 Baseline | Capture GraphQL operations, bridge messages, socket events, operator messages per platform strategy, asset URLs | Unchanged |
| M1 Framework in place | `src/framework` and `src/app` added; US shell parts re-hosted on the framework (router, hosts, services where identical); US canvas runs inside `LegacyCanvasFrame` (today's iframe and bridge, now typed) | Unchanged |
| M2 New games | Built React-first on the framework. No dependency on the US canvas | Unchanged |
| M3 US incremental moves (optional) | A US screen moves to React only when it needs substantial work anyway; gameplay surfaces (match sim, pack opening) become Pixi scenes when touched | Same flows, screen by screen |
| M4 Iframe removal for US | Only when no US screen remains in the legacy canvas and operator messaging is validated from the top window | Validated per operator |

## B3. Legacy rules
- The US canvas keeps its own `graphql-request` client, socket, wrappers and asset loader until M4. The framework does not duplicate these for US; new games use the framework services.
- Typed legacy bridge: same message names and payloads as today, origin-checked; security fixes from doc 10 are applied as approved separate changes.
- Operator messaging: while US runs in the iframe, its canvas keeps posting to parent and grandparent (GameFlex, Aristocrat). New games post from the app window. Both paths are captured and compared per platform strategy before any change (doc 08 OP tests).
- Earlier canvas-engine refactors (registry inversion, ScreenRouter) are no longer required for the target. They are done only if a US change needs them.

## B4. Exit criteria per stage
| Stage | Exit |
|---|---|
| M0 | Baselines reproducible by script |
| M1 | US regression suite equal to baseline |
| M2 | First new game passes doc 08 on real backend contracts |
| M3 | Each moved screen passes its regression and accessibility checks |
| M4 | Operator suite OP1 to OP6 green for every live platform strategy |
