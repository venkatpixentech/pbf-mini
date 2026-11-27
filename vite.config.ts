import react from '@vitejs/plugin-react';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type HtmlTagDescriptor, type Plugin } from 'vite';

import { thirdPartyNotices } from './vite-plugins/thirdPartyNotices.mjs';

const src = fileURLToPath(new URL('./src', import.meta.url));

/** Games are folders under src/games with an index.ts. */
export const listGames = () => readdirSync(`${src}/games`).filter((d) => existsSync(`${src}/games/${d}/index.ts`));

function gameEntry(id: string | undefined) {
  if (!id || !listGames().includes(id)) {
    throw new Error(`Set GAME_ID to one of: ${listGames().join(', ')} (e.g. npm run dev -- higherlower)`);
  }
  return `${src}/games/${id}/index.ts`;
}

// Owner: Portion 6 (assets).
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

/** Content hash (8 hex) of every file this game ships from public/assets, keyed by path under public/assets. */
function assetVersions(id: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const file = join(dir, name);
      if (statSync(file).isDirectory()) walk(file);
      else
        out[relative('public/assets', file).replace(/\\/g, '/')] = createHash('md5')
          .update(readFileSync(file))
          .digest('hex')
          .slice(0, 8);
    }
  };
  for (const folder of ['common', id ?? ''])
    if (folder && existsSync(`public/assets/${folder}`)) walk(`public/assets/${folder}`);
  return out;
}

// Chunks Pixi imports dynamically while creating a WebGL renderer (WebGPU is not used: preference is webgl).
const PIXI_RENDERER_CHUNKS = /^(WebGLRenderer|SharedSystems|colorToUniform|browserAll|webworkerAll)$/;
// The fonts the first screen renders with (GameBoot FONTS); Demi loads on first use.
const CRITICAL_FONTS = /^(Degular-Black|Degular-Bold|AvenirNextLTPro-Regular|AvenirNextLTPro-Bold)-.*\.woff2$/;

// Owner: Portion 2 (boot).
/**
 * Startup hints in index.html. Without them the browser only discovers the screen code, Pixi and the fonts
 * after the boot script has downloaded and run, one round trip after another. With them every critical file
 * starts downloading as soon as the HTML is parsed.
 * - title: the game's title (also shown by the inline loader)
 * - build: <link rel=modulepreload> for the screen code the boot imports dynamically (and its imports),
 *   plus Pixi's renderer chunks; <link rel=preload as=font> for the critical fonts.
 */
function startupHints(id: string | undefined): Plugin {
  const def = id ? readFileSync(gameEntry(id), 'utf8') : '';
  const title = id ? /title:\s*'([^']+)'/.exec(def)?.[1] : 'PBF';
  if (!title) throw new Error(`${gameEntry(id)}: write the title as text, e.g. title: 'My Game'`);
  const pixiGame = /renderer:\s*'pixi'/.test(def);
  const gameDir = `/src/games/${id}/`;
  return {
    name: 'startup-hints',
    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        html = html.replaceAll('%GAME_TITLE%', title);
        const bundle = ctx.bundle;
        if (!bundle) return html; // dev server: no hints needed
        const chunks = Object.values(bundle).filter((c) => c.type === 'chunk');
        const entry = chunks.find((c) => c.isEntry);
        const wanted = new Set<string>();
        const add = (file: string) => {
          if (wanted.has(file)) return;
          wanted.add(file);
          const c = chunks.find((x) => x.fileName === file);
          c?.imports.forEach(add);
        };
        // Pixi game: the screen, the Pixi preload and warm-up modules (and what they import) plus the renderer
        // chunks. DOM game: only the screen; the boot's Pixi imports exist in the bundle but never run.
        const isScreen = (file: string) =>
          Object.keys(chunks.find((c) => c.fileName === file)?.modules ?? {}).some((m) =>
            m.replaceAll('\\', '/').includes(gameDir),
          );
        entry?.dynamicImports.filter((f) => pixiGame || isScreen(f)).forEach(add);
        if (pixiGame) chunks.filter((c) => PIXI_RENDERER_CHUNKS.test(c.name)).forEach((c) => add(c.fileName));
        // the entry itself and its static imports are already loaded by the <script> tag / Vite's own preloads
        if (entry) [entry.fileName, ...entry.imports].forEach((f) => wanted.delete(f));
        // the screen's own stylesheet: fetched early, applied by Vite when the screen module loads
        // (as=style, not rel=stylesheet, so it never blocks the first paint of the inline loader)
        const css = new Set(
          chunks.filter((c) => wanted.has(c.fileName)).flatMap((c) => [...(c.viteMetadata?.importedCss ?? [])]),
        );
        // Normal priority for all of them: measured, fetchpriority=low on the renderer chunks made Acca Crash
        // (no assets to wait for) about 650 ms slower on Slow 4G, because the stage then waited for them.
        const tags: HtmlTagDescriptor[] = [...wanted].map((file) => ({
          tag: 'link',
          attrs: { rel: 'modulepreload', crossorigin: '', href: `./${file}` },
          injectTo: 'head',
        }));
        css.forEach((file) =>
          tags.push({
            tag: 'link',
            attrs: { rel: 'preload', as: 'style', crossorigin: '', href: `./${file}` },
            injectTo: 'head',
          }),
        );
        for (const asset of Object.values(bundle)) {
          if (asset.type === 'asset' && CRITICAL_FONTS.test(asset.fileName.split('/').pop() ?? '')) {
            tags.push({
              tag: 'link',
              attrs: { rel: 'preload', as: 'font', type: 'font/woff2', crossorigin: '', href: `./${asset.fileName}` },
              injectTo: 'head',
            });
          }
        }
        return { html, tags };
      },
    },
  };
}

// One game per dev server and per build, chosen by GAME_ID (scripts/dev.mjs, scripts/build.mjs).
export default defineConfig(({ command }) => {
  const id = process.env.GAME_ID;
  return {
    base: './',
    publicDir: command === 'build' ? false : 'public',
    plugins: [react(), gameAssets(id), startupHints(id), thirdPartyNotices()],
    define: { __ASSET_VERSIONS__: JSON.stringify(command === 'build' ? assetVersions(id) : {}) },
    resolve: {
      alias: [
        { find: '@game', replacement: gameEntry(id) },
        { find: /^(core|games)\//, replacement: `${src}/$1/` },
      ],
    },
    server: { port: 3100 },
    // Builds go outside the project (default: ../pbf-game-builds/<id>); set BUILD_DIR to change the folder.
    // Default chunking on purpose: forcing Pixi into one manual chunk moved Vite's preload helper into it,
    // which made every game (DOM games too) load Pixi. The extra Pixi chunks are preloaded from the HTML instead.
    build: { outDir: resolve(process.env.BUILD_DIR ?? '../pbf-game-builds', id ?? ''), emptyOutDir: true },
  };
});
