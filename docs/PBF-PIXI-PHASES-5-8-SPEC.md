# Phases 5 to 8: approved spec

Approved as one implementation plan, with the four contract corrections below. Baseline: 71 browser tests, 20 self-checks, `typecheck`
and `lint` clean. Everything stays uncommitted until a change-set review. No new dependency in any phase (a need for one is a stop).
Rules: React owns screens, layout, controls, accessibility, flow and backend calls; Pixi only for bounded scenes (one Application per
stage); Last Man Standing stays DOM-only; optional services stay out of the boot path; adapt the copied legacy files in `legacy/corelib`
(not committed) and explain new files in `docs/PBF-PIXI-CAPABILITY-MATRIX.md`; no FEG conventions were supplied, none are applied.

## Contract corrections

1. **Audio.** Settings persist across reloads when storage works. When storage is blocked they work for the current session and fall back
   to defaults after a reload. The unlock listeners are removed only after `AudioContext.resume()` succeeds; a failed resume keeps them, and a
   later gesture retries (tested).
2. **Host bridge.** The initial outbound `targetOrigin` is never `*`: the configured `hostOrigin`, else the parent origin read from
   `location.ancestorOrigins` or `document.referrer` when it is in the allowlist, else (several allowed origins and none known) one
   handshake per allowed origin, each addressed to that origin. After a valid `HOST_INIT` the bridge binds to that `event.source` and
   `event.origin`: later messages from anything else are rejected and every outbound message goes to the bound origin. The contract has
   no request and response: messages are one-way in both directions (no request ids, timeouts or pending requests). Operator adapters stay deferred.
3. **Scene utilities.** A drag that starts on a card and passes the 10 CSS px tap threshold belongs to the strip: the Phase 4 rule already
   makes that press a `release` with no `tap`, and the strip claims the gesture at the same threshold, so scrolling can never also select
   a card. A press that lands on a strip still coasting stops it and is not a tap. Remote sprites use the Phase 3 asset registry (key: the
   URL); changing the URL or destroying the sprite while a load is pending releases the old lease and the stale result is never applied (tested).
4. **Scaffold.** `--scene`, `--sound`, both together and the React-only default are each scaffolded and built in a temporary workspace
   (`npm ci` there), and the fourth game's code and assets are shown to stay out of the other games' builds, and theirs out of its build.

## Phase 5: audio (`core/audio`, lazy, Web Audio, no dependency)

Files: `SoundServiceProxy.ts` (adapted), `SoundManager.ts` (adapted), `SoundConfig.ts`, `SoundStep.ts` + `Sound.check.ts`, `react.ts`;
`tests/fixtures/audio-harness/` (`index.html`, `main.tsx`, `public/assets/audioprobe/sounds/{mp3,ogg}`); `tests/e2e/audio.spec.ts`;
`scripts/build-harness.mjs`, `scripts/check-games.mjs` (rules 13 and 14), `package.json` (check script), `PixiGameConfig.sounds`.
Event-to-sound flow (no `EventHandlerService`): scene event, screen `onEvent`, `sound.handle(event, param)`, play or stop by config.
Acceptance: lazy load; unlock and retry; measured playback, retrigger, ambient, fade, stop; mute, volume, toggles, persistence and blocked
storage; hidden tab; failures; 20-cycle cleanup (listeners, contexts created equal closed).

## Phase 6: host bridge (`core/host`, lazy)

Files: `WrapperServiceProxy.ts` (adapted), `HostMessages.ts` (typed envelope and validators) + `Host.check.ts`, `HostAdapter.ts`, `react.ts`;
`tests/fixtures/host-harness/` (`index.html` the game page, `parent.html` the host page, served as `127.0.0.1` parent and `localhost`
iframe); `tests/e2e/host.spec.ts`; `build-harness.mjs`; `check-games.mjs` rule 15 (boot and `index.ts` never import `core/host`).
Acceptance: valid handshake and messages; wrong origin, wrong source window, malformed envelope, unknown name rejected; empty allowlist
accepts nothing; outbound never `*`; binding after `HOST_INIT`; teardown leaves no listener (20 cycles).

## Phase 7: scene utilities

Files: `core/pixi/wrapper/ScrollBox.ts`, `List.ts`, `trackpad/{Trackpad,SlidingNumber,ScrollSpring,Spring}.ts` (adapted; physics is plain TypeScript,
checked in Node, `typed-signals` replaced by Pixi's emitter), `PixDynamicSprite.ts` (adapted on the asset registry), `core/pixi/FPSMeterView.ts`
(adapted, dev only); display harness stages `R` (strip) and `D` (remote sprites); `tests/e2e/scroll.spec.ts`. Page scrolling and page lists stay React.
Acceptance: wheel, drag, touch and momentum; clipping and limits; tap versus scroll arbitration; release; remote sprite load, fallback,
shared request, URL change and destroy while pending, release; FPS meter in the dev-defined harness only and absent from production builds.

## Phase 8: fourth-game proof

Files: `scripts/new-game.mjs` (`--scene`, `--sound`), `scripts/verify-scaffold.mjs`, `docs/03-GAME-DEVELOPMENT-GUIDE.md`; `src/games/cardpick/`
(`index.ts`, `cardpick.css`, `CardPickScreen.tsx`, `api/{types,mockServer,mockServer.check}.ts`, `pixi/config/{game.config,config.check}.ts`,
`pixi/view/CardPickScene.ts`), `public/assets/cardpick/` (PBF atlas copy and sounds), `tests/e2e/helpers.ts` + `tests/e2e/cardpick.spec.ts`.
Acceptance: the four scaffold variants build in isolation from a clean `npm ci` workspace; `cardpick` plays with tap and keyboard twin, sound
and mute; its code and assets are absent from the other builds and theirs from its build; Last Man Standing unchanged.
