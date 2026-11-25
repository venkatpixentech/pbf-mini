// npm run build [-- <gameId> ...]   Builds each game on its own into ../pbf-game-builds/<gameId> (outside the project; set BUILD_DIR to change). No ids: every game.
import { existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { build } from 'vite';

const all = readdirSync('src/games').filter((d) => existsSync(`src/games/${d}/index.ts`));
const ids = process.argv.slice(2).length ? process.argv.slice(2) : all;
for (const id of ids) {
  process.env.GAME_ID = id;
  console.log(`\n=== ${id} ===`);
  await build({ configFile: 'vite.config.ts', logLevel: 'warn' });
  console.log(`built ${resolve(process.env.BUILD_DIR ?? '../pbf-game-builds', id)}`);
}
