# pbf-game-framework

React-first game framework for PBF-style games. React owns the app; PixiJS renders gameplay only. Separate from the existing PBF project, which is never modified from here.

```bash
npm install
npm run dev <gameId>   # http://localhost:3100, one game per server: higherlower, accacrash, lastmanstanding
npm run check      # structure rules (check:games) plus every mock backend self-check
npm run build      # tsc + vite build
npm run new-game <id> "<Title>"   # scaffold a new game that passes every check
npm run lint
```

| Folder | Content |
|---|---|
| `src/core/pixi` | `PixiStage`, scene contract, stage assets |
| `src/core/services` | Money helpers, RoundEngine |
| `src/games/<id>` | One folder per game: `higherlower`, `accacrash`, `lastmanstanding` (screens, scenes, API contract, mock backend). New game: `docs/16-creating-a-new-game.md` |
| `scripts` | `dev.mjs`, `build.mjs`, `check-games.mjs` (rules every game must follow), `new-game.mjs` (scaffold) |
| `public/assets/common` | Assets copied from PBF's shared pack |
| `docs` | Architecture, plan and results (start with `17-framework-status.md`, then `16-creating-a-new-game.md`) |
