// npm run verify-scaffold [-- --fast] [-- --keep]
// Proves the documented new-game workflow on a clean copy of the project, so nothing in this workspace (node_modules, the legacy
// reference folder, earlier builds) can make a broken workflow look fine:
//   1. copies the project without node_modules, legacy, builds or test output into a temp folder,
//   2. runs `npm ci` there (needs the network; --fast links this workspace's node_modules instead, for a quick local run),
//   3. scaffolds four games: no flag, --scene, --sound and --scene --sound,
//   4. runs the structure checks, the type check, lint, and builds each scaffolded game,
//   5. asserts what each build contains: Pixi only in a lazy chunk of a --scene game, audio only in a lazy chunk of a --sound game,
//      and neither in the boot (entry plus static imports) of any of them.
// Exits 1 on the first failure. The temp folder is removed unless --keep is given.
import { execSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve, sep } from 'node:path';

const fast = process.argv.includes('--fast');
const keep = process.argv.includes('--keep');
const source = resolve('.');
const work = mkdtempSync(join(tmpdir(), 'pbf-scaffold-'));
const builds = join(work, 'builds');
const skip = new Set(['node_modules', 'legacy', 'dist', 'test-results', 'playwright-report', '.git', '.claude']);

const run = (command, env = {}) => {
  console.log(`\n$ ${command}`);
  execSync(command, { cwd: work, stdio: 'inherit', env: { ...process.env, BUILD_DIR: builds, ...env } });
};
const fail = (message) => {
  console.error(`\nverify-scaffold FAILED: ${message}`);
  if (!keep) rmSync(work, { recursive: true, force: true });
  else console.error(`(kept ${work})`);
  process.exit(1);
};

console.log(`verify-scaffold: working in ${work}`);
cpSync(source, work, {
  recursive: true,
  filter: (path) => !skip.has(relative(source, path).split(sep)[0]),
});
// a clean install must not depend on anything outside the copied project
for (const name of skip)
  if (existsSync(join(work, name)) && name !== '.git') fail(`${name} was copied into the clean workspace`);

if (fast) symlinkSync(join(source, 'node_modules'), join(work, 'node_modules'), 'junction');
else run('npm ci');

const variants = [
  { id: 'scaffoldplain', flags: [], pixi: false, audio: false },
  { id: 'scaffoldscene', flags: ['--scene'], pixi: true, audio: false },
  { id: 'scaffoldsound', flags: ['--sound'], pixi: false, audio: true },
  { id: 'scaffoldboth', flags: ['--scene', '--sound'], pixi: true, audio: true },
];
for (const v of variants) run(`node scripts/new-game.mjs ${v.id} "Scaffold ${v.id.slice(8)}" ${v.flags.join(' ')}`);

// what each variant produced
for (const v of variants) {
  const dir = join(work, 'src/games', v.id);
  const has = (f) => existsSync(join(dir, f));
  const want = {
    'pixi/config/game.config.ts': v.pixi,
    'pixi/config/config.check.ts': v.pixi,
    'sound/sound.config.ts': v.audio,
    'sound/sound.check.ts': v.audio,
  };
  for (const [file, expected] of Object.entries(want))
    if (has(file) !== expected) fail(`${v.id}: ${file} should ${expected ? '' : 'not '}exist`);
  if (v.pixi && !readdirSync(join(dir, 'pixi/view')).some((f) => f.endsWith('Scene.ts')))
    fail(`${v.id}: no scene file`);
  const index = readFileSync(join(dir, 'index.ts'), 'utf8');
  if (v.pixi !== /renderer: 'pixi'/.test(index)) fail(`${v.id}: renderer in index.ts does not match --scene`);
}

run('npm run check');
run('npx tsc --noEmit');
run('npm run lint');
run(`npm run build -- ${variants.map((v) => v.id).join(' ')}`);

// what each build contains
const analyse = (id) => {
  const dir = join(builds, id);
  const assets = join(dir, 'assets');
  const chunks = new Map();
  for (const name of readdirSync(assets).filter((f) => f.endsWith('.js'))) {
    const code = readFileSync(join(assets, name), 'utf8');
    chunks.set(name, {
      pixi: /PixiJS|pixijs\.com/.test(code),
      audio: /AudioContext/.test(code) && /createGain/.test(code),
      statics: [...code.matchAll(/(?:from|import)\s*["']\.\/([^"']+\.js)["']/g)].map((m) => m[1]),
    });
  }
  // every chunk loaded together with a starting chunk: itself plus its static imports
  const closure = (start) => {
    const seen = new Set();
    const visit = (name) => {
      if (seen.has(name) || !chunks.has(name)) return;
      seen.add(name);
      chunks.get(name).statics.forEach(visit);
    };
    if (start) visit(start);
    return seen;
  };
  const html = readFileSync(join(dir, 'index.html'), 'utf8');
  const entry = /<script[^>]*type="module"[^>]*src="\.\/assets\/([^"]+\.js)"/.exec(html)?.[1];
  const screen = [...chunks.keys()].find((n) => /Screen-[\w-]+\.js$/.test(n));
  return { chunks, boot: closure(entry), screen: closure(screen), hasScreen: !!screen };
};
for (const v of variants) {
  const { chunks, boot, screen, hasScreen } = analyse(v.id);
  if (!hasScreen) fail(`${v.id}: no screen chunk in the build`);
  const some = (names, key) => [...names].some((n) => chunks.get(n)[key]);
  // The boot must never load Pixi or audio. Chunks that exist only to be imported on demand (the boot's lazy warm-up) may be in
  // the build, so what matters is what the entry and the game screen load together.
  if (some(boot, 'pixi')) fail(`${v.id}: the boot statically loads Pixi`);
  if (some(boot, 'audio')) fail(`${v.id}: the boot statically loads audio`);
  if (some(screen, 'pixi') !== v.pixi) fail(`${v.id}: the screen ${v.pixi ? 'does not load' : 'loads'} Pixi`);
  if (some(screen, 'audio') !== v.audio) fail(`${v.id}: the screen ${v.audio ? 'does not load' : 'loads'} audio`);
  if (!v.audio && some(chunks.keys(), 'audio')) fail(`${v.id}: audio code is in a build that does not use it`);
  console.log(
    `  ${v.id}: screen loads pixi ${v.pixi ? 'yes' : 'no'}, audio ${v.audio ? 'yes' : 'no'}; boot loads neither`,
  );
}

console.log('\nverify-scaffold: ok (clean install, four variants scaffolded, checked, built and isolated)');
if (!keep) rmSync(work, { recursive: true, force: true });
