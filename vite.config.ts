import react from '@vitejs/plugin-react';
import { cpSync, existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';

const src = fileURLToPath(new URL('./src', import.meta.url));

/** Games are folders under src/games with an index.ts. */
export const listGames = () => readdirSync(`${src}/games`).filter((d) => existsSync(`${src}/games/${d}/index.ts`));

function gameEntry(id: string | undefined) {
  if (!id || !listGames().includes(id)) {
    throw new Error(`Set GAME_ID to one of: ${listGames().join(', ')} (e.g. npm run dev -- higherlower)`);
  }
  return `${src}/games/${id}/index.ts`;
}

/** Build only: ship public/assets/common plus this game's own public/assets/<id>, never other games' art. */
function gameAssets(id: string | undefined): Plugin {
  let outDir = '';
  return {
    name: 'game-assets',
    apply: 'build',
    configResolved: (c) => void (outDir = resolve(c.root, c.build.outDir)),
    closeBundle() {
      for (const folder of ['common', id ?? '']) {
        const from = resolve('public/assets', folder);
        if (existsSync(from)) cpSync(from, resolve(outDir, 'assets', folder), { recursive: true });
      }
    },
  };
}

// One game per dev server and per build, chosen by GAME_ID (scripts/dev.mjs, scripts/build.mjs).
export default defineConfig(({ command }) => {
  const id = process.env.GAME_ID;
  return {
    base: './',
    publicDir: command === 'build' ? false : 'public',
    plugins: [react(), gameAssets(id)],
    resolve: {
      alias: [
        { find: '@game', replacement: gameEntry(id) },
        { find: /^(core|games)\//, replacement: `${src}/$1/` },
      ],
    },
    server: { port: 3100 },
    // Builds go outside the project (default: ../pbf-game-builds/<id>); set BUILD_DIR to change the folder.
    build: { outDir: resolve(process.env.BUILD_DIR ?? '../pbf-game-builds', id ?? ''), emptyOutDir: true },
  };
});
