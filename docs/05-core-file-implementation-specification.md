# 05. Core file implementation specification (React-first)

Revision 2, 2026-11-23. Replaces the canvas-first revision. Paths follow doc 04 rev 2.
- **Part A: Target files** (`src/app`, `src/framework`, game template).
- **Part B: Migration files** (legacy Ultimate Soccer hosting and bridge).

Each card answers the ten required points in this order: **Why** (why required, problem solved), **Owns**, **Must not**, **Exports**, **Contract** (input/output), **Depends on**, **Used by**, **Communication**, **Tests** (IDs from doc 08).
Category: [Core] framework, [Game] game-specific, [Backend] backend-dependent, [Opt] optional, [Util] shared utility.

---
# Part A: Target files

## A1. App

### app/App.tsx [Core]
- **Why:** One place for providers and routing; today `src/App.tsx` hard-wires US.
- **Owns:** Provider order (Apollo, i18n, notifications, error boundary), router mount.
- **Must not:** Contain game logic or data fetching.
- **Exports:** `App`.
- **Contract:** In: enabled game definitions (`app/games.ts`). Out: rendered tree.
- **Depends on:** `framework/services/api`, `framework/services/i18n`, `framework/ui/hosts`, `app/router`.
- **Used by:** `app/main.tsx`.
- **Communication:** React context only.
- **Tests:** RF3, RF6.

### app/router/routes.ts and Router.tsx [Core]
- **Why:** Routes are hard-coded in `src/router/config.tsx`; lazy components were created inside render bodies (`Home.tsx:87-88`).
- **Owns:** Collecting `routes` from each `GameDefinition`, lazy loading at module level, HashRouter (kept for operator URL compatibility).
- **Must not:** Know screen internals.
- **Exports:** `buildRoutes(defs)`, `Router`.
- **Contract:** In: `RouteDef[]`. Out: route tree; unknown route -> not-found screen.
- **Depends on:** `framework/contract`.
- **Used by:** `App`.
- **Communication:** URL and React Router hooks.
- **Tests:** RF3.

### app/AppShell.tsx [Core]
- **Why:** Frame sizing, `--vh`, rotate message and hosts already exist in `src/components/AppShell.tsx`.
- **Owns:** Layout frame, viewport variables, hosts placement.
- **Must not:** Read game state (today it reads `platformStrategy` for one operator; moves to wrappers config).
- **Exports:** `AppShell`.
- **Depends on:** `framework/ui/hosts`, `framework/state`.
- **Tests:** RF4, manual layout checks.

## A2. Contract

### framework/contract/GameDefinition.ts [Core]
- **Why:** New games need one typed entry point instead of hard-coded wiring.
- **Owns:** Types `GameDefinition { id; version; routes; scenes; config; stageAssets; round?; api; state?; features?; content }`, `RouteDef`, `StageAssetPack`, `GameApi`.
- **Must not:** Contain runtime code.
- **Exports:** types only.
- **Contract:** Pure data plus factories (screen components, scene factories).
- **Depends on:** `framework/pixi/scene.ts` (types), `ConfigSchema`.
- **Used by:** `app`, `validateDefinition`, every game.
- **Tests:** RF1, RF2 (type tests and validation fixtures, synthetic only).

### framework/contract/ConfigSchema.ts [Core][Util]
- **Why:** Prototype tunables (RTP, countdown, volumes) and US config need types and ranges.
- **Owns:** `defineConfig(schema)`, `validateConfig(schema, values) -> { ok, errors }`.
- **Must not:** Load or persist config.
- **Tests:** Bounds, defaults, type errors.

### framework/contract/validateDefinition.ts [Core]
- **Why:** Missing routes, scenes or assets are runtime surprises today (unknown class -> bare TypeError).
- **Owns:** Checks that every route component, scene factory, stage asset key and config value exists and is valid.
- **Exports:** `validateDefinition(def) -> Issue[]`.
- **Used by:** `tools/validate-games.mjs` (CI), dev boot.
- **Tests:** RF1, RF2.

## A3. State

### framework/state/coreStore.ts [Core]
- **Why:** `src/store/gameStore.ts` mixes generic and football fields in one store.
- **Owns:** Session snapshot (no token), balance and coins, settings (audio, odds format), connectivity, host flags (drawers, modals, popups).
- **Must not:** Hold game data or the `beToken`.
- **Exports:** `useCoreStore`, selectors, actions.
- **Contract:** Actions are the only writers; services write balance and connectivity.
- **Depends on:** zustand.
- **Used by:** screens, hosts, services.
- **Communication:** subscriptions.
- **Tests:** RF5.

### framework/state/registerGameSlice.ts [Core]
- **Owns:** Adding a namespaced game slice; rejects keys that collide with core keys.
- **Exports:** `registerGameSlice(id, factory)`, `useGameSlice(id)`.
- **Tests:** RF5.

## A4. UI

### framework/ui/hosts/PopupHost.tsx [Core]
- **Why:** Error UIs are split (`ErrorPopUpModal`, `CanvasPopUpModal`, canvas popups) with two error maps.
- **Owns:** One priority stack: init > maintenance > session > network > business; dedupe; action buttons from `services/errors` (retry, reload, dismiss).
- **Must not:** Map error codes itself.
- **Exports:** `PopupHost`, `showPopup(spec)`.
- **Depends on:** `services/errors`, `coreStore`.
- **Tests:** RF4, RF6, SV2.

### framework/ui/hosts/DrawerHost.tsx and ModalHost.tsx [Core]
- **Why:** Today every drawer is always mounted and opened by booleans in one store.
- **Owns:** Registry of drawers and modals (games register theirs), open state in `coreStore`.
- **Exports:** `DrawerHost`, `ModalHost`, `registerDrawer`, `registerModal`, `openDrawer(id, props)`, `openModal(id, props)`.
- **Tests:** RF4.

### framework/ui/bet/StakeInput.tsx and MinMaxStakeModal.tsx [Core]
- **Why:** Stake entry and limit messages are tangled inside the 1856-line `StakePannelInput.tsx`, with string comparisons (D2).
- **Owns:** Keypad entry, presets, display formatting, limit feedback using `StakeValidator`.
- **Must not:** Know football markets or call the backend.
- **Exports:** `StakeInput`, `MinMaxStakeModal`.
- **Contract:** In: `value`, `limits {min,max,maxPayout}`, `currency`, `onChange`, `onConfirm`. Out: validated numeric stake.
- **Depends on:** `services/bet/StakeValidator`, `Money`.
- **Tests:** SV6, UI component tests.

### framework/ui/primitives/* and BalanceDisplay, WinDisplay [Core][Util]
- **Owns:** Generic components with PBF tokens (`tokens.css`); counters use CSS/GSAP.
- **Must not:** Mount Pixi.
- **Tests:** Component tests, RF8 accessibility.

## A5. Services

### framework/services/api/apolloClient.ts [Core][Backend]
- **Why:** New games need one data client usable in components and services.
- **Owns:** Existing Apollo setup (Bearer `beToken`, `x-request-id` enrichment, `no-cache`), plus a configurable timeout for round operations agreed with backend.
- **Must not:** Change operations or variables of existing documents.
- **Exports:** `apolloClient`, `setAuthToken(token)`.
- **Contract:** Errors normalized to `{ code, httpCode, requestId, operationName }`.
- **Depends on:** `@apollo/client`, `logger`.
- **Used by:** `session`, game `api` modules.
- **Tests:** SV1, SV8, RF7 (no token in logs).

### framework/services/api/errorMap.ts [Core]
- **Why:** Two different code maps today (shell and canvas).
- **Owns:** One table code -> translation key + kind; the legacy canvas keeps its own until migrated.
- **Exports:** `mapError(code) -> { key, kind }`.
- **Tests:** SV2; conflicts resolved per Q5.

### framework/services/api/responseGuards.ts [Core][Backend]
- **Why:** Responses are trusted as-is (`currentBetSlip.filter` without null check).
- **Owns:** Lightweight runtime checks for Init core fields and every new-game round response.
- **Exports:** `guardInit`, `guardRound*` functions returning typed data or throwing a classified error.
- **Tests:** SV8.

### framework/services/session/SessionService.ts [Core][Backend]
- **Why:** Token flow is scattered in the legacy canvas; new games need it without the canvas.
- **Owns:** Read operator token via `wrappers`; optional demo launch only when config allows (doc 10 S4); call `Init` with the existing core subset; keep `beToken` in memory; set Apollo token; start socket; publish a session snapshot (no token) to `coreStore`.
- **Must not:** Log, persist, or post the token across windows.
- **Exports:** `SessionService.start()`, `getSnapshot()`, `onSessionError(cb)`.
- **Contract:** In: platform strategy and URL params. Out: snapshot `{ playerRef, currency, language, limits, flags, balance }`.
- **Depends on:** `api`, `socket`, `wrappers`, `errors`.
- **Used by:** app boot, games.
- **Tests:** SV1, SV2, SE4.

### framework/services/socket/SocketService.ts [Core][Backend]
- **Why:** Same socket behaviour needed outside the canvas.
- **Owns:** socket.io connect with `auth.token`, websocket transport, 5 reconnects, 10 s max delay, PING/PONG heartbeat, typed map of existing events plus new-game events once specified.
- **Exports:** `socket.connect(token)`, `on(event, handler) -> Disposer`, `emit`.
- **Tests:** SV3.

### framework/services/round/RoundEngine.ts and RoundState.ts [Core]
- **Why:** No formal state machine today; resume logic copied three times.
- **Owns:** `RoundDefinition { phases; initial; resumeMap }`, timers, server-driven `advance(event)`, `resume(status)`, current `RoundState`.
- **Must not:** Call the backend or decide outcomes.
- **Exports:** `createRoundEngine(def)`, `useRound()` hook.
- **Contract:** Emits `phaseChanged { from, to, roundId }`; unknown server status throws a classified error (no silent fallback).
- **Used by:** game screens; scenes receive phase via props.
- **Tests:** SV4.

### framework/services/bet/BetSlip.ts, Money.ts, StakeValidator.ts [Core][Backend]
- **Why:** Generic bet actions and money rules are missing; limits compared as strings today.
- **Owns:** `place`, `cancel`, `cashOut`, `setAutoCashOut` over an injected game api; in-flight guard; numeric compare and rounding; currency formatting with `currencyDecimals` fallback.
- **Must not:** Contain market rules or pricing.
- **Exports:** `createBetSlip(api)`, `Money`, `validateStake(value, limits)`.
- **Tests:** SV5, SV6, SV7.

### framework/services/audio/SoundService.ts [Core]
- **Why:** One audio owner for React screens and Pixi scenes; the legacy canvas constructs its binder twice.
- **Owns:** Howler sounds, music and SFX buses, global mute from settings and tab visibility.
- **Must not:** Be imported by scenes (scenes emit events; the screen plays sounds), keeping scenes pure.
- **Exports:** `sound.load(pack)`, `play(id)`, `stop(id)`, `setMuted`, `setVolume(bus, v)`.
- **Tests:** SV9.

### framework/services/wrappers/OperatorWrapper.ts + adapters [Core][Backend]
- **Why:** New games must speak to the same operators as today, from the app window.
- **Owns:** Platform strategy detection, outbound messages (loaded, progress, ready, balance, round start/end, sound) and inbound handling per adapter; origin allow-list.
- **Must not:** Change message names or payloads from the baseline.
- **Exports:** `wrappers.init(strategy)`, `send(event, data)`, `on(event, cb)`.
- **Contract:** Baseline per strategy from `tools/baseline`.
- **Tests:** OP1 to OP6.

### framework/services/errors/ErrorService.ts and logger.ts [Core][Util]
- **Owns:** `classify(err) -> { kind, code, action }`, global `error`/`unhandledrejection` handlers, React error boundary hookup, logger with redaction and production silence.
- **Tests:** RF6, RF7, SE1.

## A6. Pixi

### framework/pixi/scene.ts [Core]
- **Why:** Scenes must be independent, reusable and strongly typed.
- **Owns:** Types only:
```ts
interface SceneContext<E> {
  app: Application; root: Container; assets: LoadedAssets;
  emit(event: E): void;
  track(disposer: () => void): void; // listeners, tweens, timers
}
interface PixiScene<P, E> {
  init(ctx: SceneContext<E>): Promise<void>;
  update(props: P): void;
  resize(width: number, height: number): void;
  destroy(): void;
}
type SceneFactory<P, E> = () => PixiScene<P, E>;
```
- **Must not:** Reference React, stores or services.
- **Tests:** SC2 (type tests), SC3.

### framework/pixi/PixiStage.tsx [Core]
- **Why:** Pixi lifecycle must be isolated behind one reusable React component; no shared application.
- **Owns:** On mount: create `Application` (DPR cap 2, `failIfMajorPerformanceCaveat` as today), append canvas to a ref element, load stage assets, `scene.init`. On props change: `scene.update`. `ResizeObserver` -> `app.renderer.resize` + `scene.resize`. `visibilitychange` -> ticker stop/start. `webglcontextlost` -> report to `ErrorService`, show controlled recovery. On unmount: `scene.destroy`, run tracked disposers, unload this stage's assets, `app.destroy` (children, stage textures).
- **Must not:** Fetch data, route, read stores, or keep module-level state between mounts.
- **Exports:** `PixiStage<P, E>(props: { scene: SceneFactory<P,E>; props: P; assets: StageAssetPack; onEvent: (e: E) => void; onError?: (err: StageError) => void; transparent?: boolean; paused?: boolean })`.
- **Implementation note:** `useRef` + `useLayoutEffect` (React 18). Guard against double mount in StrictMode by tracking a mount token.
- **Depends on:** `pixi.js`, `scene.ts`, `stageAssets.ts`. Errors (context loss, asset failure) go out through the `onError` prop; the screen forwards them to `services/errors`, so the stage never imports services.
- **Used by:** game screens, `FxLayer`.
- **Tests:** V1 to V8, SC1, SC4, SC5.

### framework/pixi/stageAssets.ts [Core]
- **Why:** Scenes reuse PBF atlases and Spine; loading must be scoped to the stage so unmount frees memory.
- **Owns:** Resolving names to `${__ASSETS_DIR__}/...` (shared PBF pack) or `${__ASSETS_DIR__}/games/<id>/...`, resolution folder (`@1x`/`@0.5x`), reference counting so shared textures are kept while another stage uses them.
- **Exports:** `loadStageAssets(pack) -> LoadedAssets`, `unloadStageAssets(pack)`.
- **Tests:** V7, AS1, AS3, AS5.

### framework/pixi/spine.ts [Opt]
- **Owns:** Creating Spine instances from loaded skeleton and atlas (`@pixi/spine-pixi`), default mix settings explicit.
- **Tests:** Scene unit tests.

### framework/pixi/FxLayer.tsx [Opt]
- **Why:** React screens need Pixi effects (celebrations) without owning a canvas.
- **Owns:** A transparent `<PixiStage>` in a portal over the UI, mounted per effect and unmounted on completion event.
- **Exports:** `FxLayer`, `playFx(effectId, props) -> Promise<void>`.
- **Tests:** V3.

### framework/pixi/view/index.ts [Util]
- **Why:** Reuse the existing `corelib/pixiwrapper` classes in new scenes without copying code.
- **Owns:** Re-exports of wrapper classes that have no game imports (verified per class before export).
- **Must not:** Re-export anything from `corelib/models` or `teamformation`.
- **Tests:** SC3, boundary check.

## A7. Game template files [Game]
| File | Owns | Must not | Tests |
|---|---|---|---|
| `games/<id>/definition.ts` | Assembles the `GameDefinition` | Side effects at import | RF1 |
| `screens/*.tsx` | UI, data via game api and services, mounts stages | Pixi classes directly | Component tests |
| `scenes/<Name>Scene.ts` + `.types.ts` | Rendering for one surface; typed props and events | Backend, stores, React | SC1 to SC6 |
| `api/*.ts` | Typed functions over its Apollo documents, response guards | Invented operations (only agreed contracts) | SV8 |
| `round/round.ts` | Phases, durations, resume map | Outcome logic | SV4 |
| `state/slice.ts` | Game state | Core keys | RF5 |
| `config/*.ts` | Config values, stage assets, sounds | Hard-coded URLs | RF1, AS1 |

---
# Part B: Migration files (Ultimate Soccer)

### framework/legacy/LegacyCanvasFrame.tsx [Core]
- **Why:** US must keep running unchanged while the framework is introduced.
- **Owns:** The existing iframe (`sandbox="allow-scripts allow-same-origin"`, `__ASSETS_ID__` cache-buster), canvas-ready state.
- **Must not:** Change iframe attributes or URL without operator validation; keep the dead `initPixi` branch only until the baseline proves it unused, then remove as a listed change.
- **Exports:** `LegacyCanvasFrame`.
- **Today:** `src/components/PixiContainer.tsx`.
- **Tests:** US1 to US9.

### framework/legacy/legacyProtocol.ts [Core]
- **Why:** Bridge payloads are `any`; message names spread across enums and strings.
- **Owns:** Discriminated unions `ShellToCanvas` and `CanvasToShell` covering every baseline message with today's payload shapes.
- **Must not:** Rename or reshape messages.
- **Tests:** US2 (baseline diff), type exhaustiveness.

### framework/legacy/legacyBridge.ts [Core]
- **Why:** `_transferInfoToPixi` is copied in several files; listeners are not removed; no origin check.
- **Owns:** `send(msg: ShellToCanvas)` via `contentWindow.gameExtension`, one `message` listener with origin check and typed dispatch, proper removal on unmount.
- **Must not:** Alter behaviour beyond typing and origin checks (approved security change S3).
- **Tests:** US2, OP5, SE3 (token not forwarded to `'*'` once approved).

### games/ultimate-soccer/screens/Home.tsx [Game]
- **Why:** The canvas-event switch in `src/pages/home/Home.tsx` mixes core and game handling and contains the sound-toggle defect (D1).
- **Owns:** Hosting `LegacyCanvasFrame`; game handlers for canvas events; core events (balance, popups, reload, sound) delegated to framework services.
- **Must not:** Change event semantics in the move PR; D1 fixed only as an approved change.
- **Tests:** US4 to US7, UI checks for sound toggle.

### Legacy canvas internals (`src/canvas/**`) [Game, legacy]
No new specification. They stay as audited in doc 01 until a screen is migrated (doc 09 P8). Defect fixes D1 to D12 happen only as approved, listed changes.
