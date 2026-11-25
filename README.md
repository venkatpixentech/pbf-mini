# PBF game framework

React + PixiJS framework for PBF casino-style games: one independent build per game, shared boot,
loading, layout and rendering code in `src/core`, server-decided outcomes.

```bash
npm install
npm run dev -- higherlower          # or accacrash, lastmanstanding; http://localhost:3100
npm run new-game mygame "My Game"   # scaffold a new game
npm run typecheck && npm run lint && npm run check && npm run build   # builds go to ../pbf-game-builds/<id>
```

| Folder | Contents |
|---|---|
| `src/core` | Shared platform: boot and loading, layout and UI, Pixi integration, services |
| `src/games/<id>` | One folder per game: `higherlower`, `accacrash`, `lastmanstanding` |
| `public/assets` | Shared art in `common/`, each game's art in `<id>/` |
| `scripts` | dev, build, structure check, new-game scaffold |
| `docs` | Documentation: start with [docs/00-PBF-OVERVIEW.md](docs/00-PBF-OVERVIEW.md) |
