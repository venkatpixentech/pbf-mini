# Archive

Historical records and evidence. Not maintained: file paths, game ids and doc numbers inside these files
describe the state at the time they were written. The current documentation is in [../](../00-PBF-OVERVIEW.md).

| Folder / file | What it is | Summarised in |
|---|---|---|
| `loading-audit/LOADING_PERFORMANCE_BEFORE_AFTER.md` | Before/after loading results, per-metric timelines, transfer and request counts | [05-LOADING-PERFORMANCE.md](../05-LOADING-PERFORMANCE.md) |
| `loading-audit/LOADING_DEPENDENCY_MAP.md` | Per-game startup dependency maps with measured timings, before and after | doc 05 |
| `loading-audit/LOADING_TEST_RESULTS.md` | Test setup and every raw timed run, functional and fault-injection test results | docs 05 and 10 |
| `compact-layout-screenshots/before/`, `after/` | Layout screenshots per game at 390x844, 320x568, landscape 844x390 and the 360x420 embed; after-only in-round states and the 420 px host box | [06-RESPONSIVE-GAME-LAYOUT.md](../06-RESPONSIVE-GAME-LAYOUT.md) |
| `plans-and-audits/01-ultimate-soccer-architecture-audit.md` | Audit of the original PBF game (separate repository): structure, defects D1 to D12, asset findings | docs 01 and 09 |
| `plans-and-audits/07-pbf-backend-and-round-lifecycle.md` | PBF transports, token lifecycle, init fields, round lifecycle with file references, error handling | doc 09 |
| `plans-and-audits/10-risk-security-and-open-questions.md` | Security findings S0 to S11, risks R1 to R10, open questions Q1 to Q10 | docs 09 and 02 |
| `plans-and-audits/20-casino-bingo-framework-plan.md` | Plan for casino and bingo game families: shared systems, contracts, build order (not built) | doc 02 |

Earlier planning documents (target architecture, file specifications, roadmap, spike and per-game build
notes) were removed after their still-valid content moved into the current docs.
