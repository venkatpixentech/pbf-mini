// npm run build:harness   Builds the browser harnesses under tests/fixtures into ../pbf-game-builds/<name> (or BUILD_DIR),
// next to the games: spine-harness -> spineharness (tests/e2e/spine.spec.ts) and display-harness -> displayharness
// (tests/e2e/display.spec.ts), audio-harness -> audioharness (tests/e2e/audio.spec.ts). They are test fixtures, not games: never part of `npm run build` and never shipped.
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
import { build } from 'vite';

import { thirdPartyNotices } from '../vite-plugins/thirdPartyNotices.mjs';

const src = resolve('src');
for (const [folder, name, pages, dev] of [
  ['spine-harness', 'spineharness'],
  ['display-harness', 'displayharness'],
  // the same page built as a development build, to test what only a dev build has (the FPS meter; tests/e2e/scroll.spec.ts)
  ['display-harness', 'displayharnessdev', undefined, true],
  ['audio-harness', 'audioharness'],
  // a game page, a host page and a rogue frame: several pages in one build
  ['host-harness', 'hostharness', ['index.html', 'parent.html', 'rogue.html']],
]) {
  const outDir = resolve(process.env.BUILD_DIR ?? '../pbf-game-builds', name);
  await build({
    configFile: false,
    root: `tests/fixtures/${folder}`,
    base: './',
    publicDir: 'public',
    plugins: [react(), thirdPartyNotices()],
    resolve: { alias: [{ find: /^(core|games)\//, replacement: `${src}/$1/` }] },
    build: {
      outDir,
      emptyOutDir: true,
      ...(pages
        ? {
            rollupOptions: {
              input: Object.fromEntries(
                pages.map((f) => [f.replace('.html', ''), resolve(`tests/fixtures/${folder}`, f)]),
              ),
            },
          }
        : {}),
    },
    ...(dev ? { define: { 'import.meta.env.DEV': 'true' } } : {}),
    logLevel: 'warn',
  });
  console.log(`built ${outDir}`);
}
