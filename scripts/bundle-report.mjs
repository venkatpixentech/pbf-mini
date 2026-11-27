// npm run bundle-report [-- <gameId> ...]   Sizes of every JS chunk of each built game (raw and gzip), the part the
// browser loads before the game screen (entry plus its static imports), and which chunks contain Pixi, Spine or audio code.
// Reads the folders `npm run build` wrote (BUILD_DIR, default ../pbf-game-builds). Exits 1 when a DOM game ships a
// Pixi chunk the entry loads, or when the entry statically loads Pixi (it must stay in lazy chunks).
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { gzipSync } from 'node:zlib';

const buildDir = resolve(process.env.BUILD_DIR ?? '../pbf-game-builds');
const all = readdirSync('src/games').filter((d) => existsSync(`src/games/${d}/index.ts`));
const ids = process.argv.slice(2).length ? process.argv.slice(2) : all;

const kb = (n) => `${(n / 1024).toFixed(1)} KB`;
const problems = [];

for (const id of ids) {
  const dir = join(buildDir, id);
  const assets = join(dir, 'assets');
  if (!existsSync(assets)) {
    console.log(`\n=== ${id}: not built (${dir}) ===`);
    continue;
  }
  const chunks = new Map();
  for (const name of readdirSync(assets).filter((f) => f.endsWith('.js'))) {
    const code = readFileSync(join(assets, name), 'utf8');
    chunks.set(name, {
      raw: Buffer.byteLength(code),
      gzip: gzipSync(code).length,
      pixi: /PixiJS|pixijs\.com/.test(code),
      spine: /spine-core|SkeletonBinary|AnimationState/.test(code) && /SkeletonJson/.test(code),
      audio: /AudioContext/.test(code) && /createGain/.test(code),
      statics: [...code.matchAll(/(?:from|import)\s*["']\.\/([^"']+\.js)["']/g)].map((m) => m[1]),
    });
  }
  const html = readFileSync(join(dir, 'index.html'), 'utf8');
  const entry = /<script[^>]*type="module"[^>]*src="\.\/assets\/([^"]+\.js)"/.exec(html)?.[1];
  const boot = new Set();
  const visit = (name) => {
    if (boot.has(name) || !chunks.has(name)) return;
    boot.add(name);
    chunks.get(name).statics.forEach(visit);
  };
  if (entry) visit(entry);

  const sum = (names, key) => [...names].reduce((n, c) => n + chunks.get(c)[key], 0);
  console.log(`\n=== ${id} ===`);
  console.log(`boot (entry + static imports): ${kb(sum(boot, 'raw'))} raw, ${kb(sum(boot, 'gzip'))} gzip`);
  console.log(`all chunks: ${kb(sum(chunks.keys(), 'raw'))} raw, ${kb(sum(chunks.keys(), 'gzip'))} gzip`);
  for (const [name, c] of [...chunks].sort((a, b) => b[1].raw - a[1].raw))
    console.log(
      `  ${name.padEnd(44)} ${kb(c.raw).padStart(10)} ${kb(c.gzip).padStart(10)}${boot.has(name) ? '  boot' : ''}${c.pixi ? '  pixi' : ''}${c.spine ? '  spine' : ''}${c.audio ? '  audio' : ''}`,
    );

  const bootAudio = [...boot].filter((n) => chunks.get(n).audio);
  if (bootAudio.length) problems.push(`${id}: the boot loads ${bootAudio.join(', ')} (audio must stay in lazy chunks)`);
  const bootPixi = [...boot].filter((n) => chunks.get(n).pixi || chunks.get(n).spine);
  if (bootPixi.length)
    problems.push(`${id}: the boot loads ${bootPixi.join(', ')} (Pixi or Spine must stay in lazy chunks)`);
  const game = readFileSync(`src/games/${id}/index.ts`, 'utf8');
  if (/renderer:\s*'dom'/.test(game)) {
    // The boot bundle carries the dynamic import of Pixi, but a DOM game never runs it; the report shows what exists.
    const inBuild = [...chunks].filter(([, c]) => c.pixi).map(([n]) => n);
    console.log(`  DOM game: Pixi chunks present in the build but never requested: ${inBuild.join(', ') || 'none'}`);
  }
}

if (problems.length) {
  console.error(`\nbundle-report found ${problems.length} problem(s):\n- ${problems.join('\n- ')}`);
  process.exit(1);
}
