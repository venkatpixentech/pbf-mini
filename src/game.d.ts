// `@game` is resolved by vite.config.ts from GAME_ID to src/games/<id>/index.ts.
declare module '@game' {
  import type { GameDefinition } from 'core/game/defineGame';
  const game: GameDefinition<any, any>;
  export default game;
}
