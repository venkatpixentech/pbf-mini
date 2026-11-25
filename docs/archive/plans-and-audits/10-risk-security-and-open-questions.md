# 10. Risks, security and open questions

No token, credential, id or secret value appears in these documents. Findings name the file and the kind of value only.

## 1. Security findings
| ID | Finding | Evidence | Severity | Remediation | Owner |
|---|---|---|---|---|---|
| S0 | A `beToken` JWT was shared in a chat on 2026-11-23; its expiry is about 114 years after issue | Session conversation (dev environment) | High | Treat as compromised: invalidate in dev; issue short-lived tokens with refresh; confirm production expiry policy | Backend / security |
| S1 | Hard-coded fallback operator token in source | `src/canvas/corelib/models/WrapperServiceProxy.ts:55` | High | Remove; rotate the value through the authorized process; fail closed when no token | FE lead + security |
| S2 | Full InitResponse including `beToken` posted with target `'*'` | `WrapperServiceProxy.ts:781-788, 1009` | High | Post to the explicit shell origin; consider not sending the token across (shell could get its own session) after backend review | FE lead + backend |
| S3 | No origin check on message listeners (shell and canvas); canvas `JSON.parse`s arbitrary strings | `src/components/SessionHelper.tsx:49`, `WrapperServiceProxy.ts:61, 73` | High | Allow-list origins per platform strategy; validate message shape | FE lead |
| S4 | Demo launch fallback runs when no token is present, with no production gate | `MessageServiceProxy.ts:164-215` | Medium | Gate behind explicit config (demo/standalone only) | FE lead + product |
| S5 | No token refresh or expiry handling; 2300 only shows a message | backend audit | Medium | Define session-expiry UX (reload to lobby) with backend | Backend + product |
| S6 | Operator token read from parent URL hash | `GameUtilClass.ts:431` | Medium | Keep (operator contract) but never log or forward URL; document | FE lead |
| S7 | Live socket exposed as `window.socketService` | `MessageServiceProxy.ts:73` | Medium | Replace the one shell use (`CanvasPopUpModal.tsx:77`) with a bridge message, then remove | FE lead |
| S8 | Pixi devtools hooks set in production | `gameApp.ts:157-167` | Low | Dev only | FE |
| S9 | Env files tracked in git (Firebase web config, URLs) | `.env.development`, `.env.staging`, `.env.production` | Low (web keys are public by design) | Confirm nothing secret is added; restrict Firebase key by domain | FE lead |
| S10 | `credentials: 'include'` on Apollo | `src/apollo/client.ts` | Low | Confirm the backend needs cookies; otherwise remove | Backend |
| S11 | Mock data on production paths | `teamformation/mock-data/*` imports | Low | Replace with real data or guard | FE |

The framework does not silently change any authentication behaviour. S1 to S4 are proposed as separate, approved changes: S3 with the typed legacy bridge in P1, the rest closed in P7 (doc 09, revision 2).

## 2. Engineering risks
| ID | Risk | Impact | Mitigation |
|---|---|---|---|
| R1 | No automated tests | Regressions unseen | P0 baseline + scripted diffs; approve Vitest, RTL and Playwright |
| R2 | God classes (`gameApp.ts` 1336, `ScreenContainer.ts` 2081, `UIUtilService.ts` 2023, `StakePannelInput.tsx` 1856 lines) | Risky splits | Extract with unchanged bodies; one concern per PR |
| R3 | Shared mutable singletons (`appModel`, `GameProxy`, `sessionHelper`) | Hidden coupling | Proxy old access onto new typed services during transition |
| R4 | `StartMatch` retries re-issue a mutation, no in-flight guard | Possible duplicate match start | Add idempotency guard after backend confirms semantics |
| R5 | Two error-code maps disagree | Different messages per side | Product decides merged table |
| R6 | Four deploy branches, independent version counters | Merge mistakes | Never edit `version.txt`; phase PRs through normal flow |
| R7 | New games depend on non-existent backend contracts | P5 blocked | Start backend spec now from prototype maths |
| R8 | Prototype maths in browser | Integrity / regulatory | Server-authoritative only; prototypes are specs |
| R9 | Unreferenced atlases (about 7.6 MB) | Bundle and storage waste | Art sign-off before removal |
| R10 | Known defects D1 to D12 (doc 01) | Behaviour already wrong in places | Fix only as approved, listed changes, never inside refactor PRs |

## 3. Open questions (answers needed, not assumed)
| ID | Question | Needed by |
|---|---|---|
| Q1 | Who owns and when will the backend contracts for Acca Crash, Higher or Lower and Last Man Standing exist (round, bet, cash out, result, push events)? | P5 |
| Q2 | Do new games live in this repo (recommended) or separate repos consuming the engine as a package? | P0 |
| Q3 | Keep the iframe for Ultimate Soccer until all its screens are migrated (M4), or never remove it? | P8 |
| Q4 | Approve Vitest, React Testing Library and Playwright as dev dependencies? | P0 |
| Q5 | Merged error-code table: which message wins on conflicts? | P3 |
| Q6 | Should the shell keep receiving `beToken` from the legacy canvas, or authenticate separately? | P1 |
| Q7 | Approved list of defect fixes (D1 sound toggle, D2 string compare, D6 double simulation, D7 unmountScreen) and their release timing | P1 |
| Q8 | Device and performance budget matrix (FPS, load time, bundle size, texture memory) | P0 |
| Q9 | Shared rounds for Acca Crash (everyone sees the same crash) or per-user rounds? Affects socket design | P3 |
| Q10 | Which operators (platform strategies) must each new game support at launch? | P6 |

## 4. Final architectural review
| Check | Answer |
|---|---|
| Can multiple similar games share the core without duplication? | Yes: session, round, bet, assets, audio, bridge, wrappers, football and social live in the engine; games supply definition, screens, api and assets |
| Are existing integrations preserved? | Yes by design: operation list, bridge messages, socket events, wrapper messages and asset URLs are baselined and diffed every phase |
| Is every responsibility in one module? | Yes for the target; transition proxies (GameProxy, sessionHelper) are temporary and listed |
| Are all required files identified? | Yes for core; game-level files follow the template in doc 04 |
| Are flows explicit? | Boot, round, bridge and socket flows are in doc 06 and 07 with file references |
| Are features extensible? | Yes via `FeatureModule` |
| Are error cases covered? | Yes in `services/errors` + doc 08 SV2, SV3, SV8, RF6 |
| Is it testable? | Yes once test tooling is approved (Q4); baseline scripts work without it |
| Unnecessary abstractions avoided? | No DI container, no pnpm migration, no package split, no slot concepts; registries only where the engine must not import games |
| Can another developer build a new game from this? | Yes after P5, following doc 03 A6 and the doc 04 A8 game template |
| Unanswered | Q1 to Q10 above; the backend contract for new games (Q1) is the critical path |
