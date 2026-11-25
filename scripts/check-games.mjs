// npm run check:games   Structure rules every game must follow (docs/03-GAME-DEVELOPMENT-GUIDE.md).
// 0. the folder name is lowercase letters and digits only, no hyphens or other special characters (e.g. accacrash)  [Portion 1]
// 1. a game is a folder under src/games with an index.ts that default-exports defineGame(...)  [Portion 1]
// 2. it never imports another game's code, CSS or asset paths (shared code belongs in src/core), its `id:` matches
//    its folder name, and only src/main.tsx and src/game.d.ts use the @game alias  [Portion 1]
// 3. it has a mock backend self-check (*.check.ts) that `npm run check` actually runs  [Portion 8]
// 4. index.ts declares renderer: 'pixi' | 'dom' and loadScreen, and stays light: it never imports its screen or a
//    scene class (only api/ and *.config files), so Pixi cannot leak into the boot bundle  [Portion 1]
// 5. a renderer: 'dom' game never imports pixi.js or core/pixi (it would load Pixi silently)  [Portion 4]
// 6. a renderer: 'pixi' game has a <PixiStage critical> (the loading overlay waits for it)  [Portion 4]
// 7. screens are built on the shared GameLayout, and never reach for its CSS classes (use core/ui/GameLayout)  [Portion 3]
// 8. src/core never imports a game and never names one (core stays independent of individual games)  [Portion 1]
// 9. a game that declares translations has English ({ en: ... }) and an i18n/en.ts dictionary  [Portion 6]
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';

const gamesDir = resolve('src/games');
const ids = readdirSync(gamesDir).filter((d) => statSync(join(gamesDir, d)).isDirectory());
const checkScript = JSON.parse(readFileSync('package.json', 'utf8')).scripts.check ?? '';
const problems = [];
const rel = (f) => relative('.', f).replaceAll(sep, '/');
const text = (f) => readFileSync(f, 'utf8');

// `from '...'`, `import('...')` and bare `import '...'` (side-effect or CSS imports)
const IMPORT_SPEC = /(?:from\s+|import\s*\(\s*|import\s+)['"]([^'"]+)['"]/g;

const walk = (dir) =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });

for (const id of ids) {
  const root = join(gamesDir, id);
  const files = walk(root);
  const where = `src/games/${id}`;
  const sources = files.filter((f) => /\.(ts|tsx)$/.test(f) && !f.endsWith('.check.ts'));

  if (!/^[a-z][a-z0-9]*$/.test(id))
    problems.push(
      `${where}: folder name must be lowercase letters and digits only (no capitals, hyphens, spaces or other special characters)`,
    );

  const indexFile = join(root, 'index.ts');
  const index = existsSync(indexFile) ? text(indexFile) : '';
  if (!index) problems.push(`${where}: no index.ts (paused or unfinished game)`);
  else if (!/export default defineGame\(/.test(index))
    problems.push(`${where}/index.ts: must \`export default defineGame({...})\``);

  for (const file of files.filter((f) => /\.(ts|tsx)$/.test(f))) {
    for (const [, spec] of text(file).matchAll(IMPORT_SPEC)) {
      const target = spec.startsWith('.')
        ? resolve(dirname(file), spec)
        : spec.startsWith('games/')
          ? resolve('src', spec)
          : null;
      if (!target) continue;
      const other = ids.find((o) => o !== id && `${rel(target)}/`.startsWith(`src/games/${o}/`));
      if (other) problems.push(`${rel(file)}: imports game "${other}" (move shared code to src/core)`);
    }
  }

  // 2. no other game's asset paths (e.g. 'accacrash/images/...') and the id matches the folder
  for (const file of files.filter((f) => /\.(ts|tsx)$/.test(f)))
    for (const other of ids.filter((o) => o !== id))
      if (new RegExp(`['"\`]${other}/`).test(text(file)))
        problems.push(`${rel(file)}: uses a path of game "${other}" (move shared assets to public/assets/common)`);
  const declaredId = /^\s*id:\s*['"]([^'"]+)['"]/m.exec(index)?.[1];
  if (index && declaredId !== id) problems.push(`${where}/index.ts: id is "${declaredId}" but the folder is "${id}"`);

  // 4. definition conventions
  const renderer = /renderer:\s*'(pixi|dom)'/.exec(index)?.[1];
  if (index) {
    if (!renderer) problems.push(`${where}/index.ts: must declare renderer: 'pixi' or renderer: 'dom'`);
    if (!/loadScreen:/.test(index)) problems.push(`${where}/index.ts: must declare loadScreen: () => import('./...')`);
    for (const [, spec] of index.matchAll(/^import[^;]*?from\s+['"](\.[^'"]*)['"]/gms)) {
      const ok = /^\.\/api\//.test(spec) || /\.config$/.test(spec);
      if (!ok)
        problems.push(
          `${where}/index.ts: imports "${spec}" statically; load screens through loadScreen and keep index.ts to api/ and *.config files`,
        );
    }
  }
  // 5. DOM games never import Pixi
  if (renderer === 'dom')
    for (const f of sources)
      if (/from\s+['"](pixi\.js|core\/pixi\/[^'"]*)['"]/.test(text(f)))
        problems.push(`${rel(f)}: renderer is 'dom' but imports Pixi (set renderer: 'pixi' or remove the import)`);
  // 6. Pixi games mark their critical stage
  if (renderer === 'pixi' && !sources.some((f) => /<PixiStage\b[^>]*\bcritical\b/s.test(text(f))))
    problems.push(`${where}: renderer is 'pixi' but no <PixiStage critical> was found; the loading overlay needs one`);
  // 7. shared layout
  if (!sources.some((f) => /from\s+['"]core\/ui\/GameLayout['"]/.test(text(f)) && /<GameLayout\b/.test(text(f))))
    problems.push(`${where}: no screen uses <GameLayout> (core/ui/GameLayout)`);
  for (const f of sources)
    if (/querySelector(All)?\([^)]*\.pbf-(layout|play|info)/.test(text(f)))
      problems.push(`${rel(f)}: reaches for GameLayout's CSS classes; use resetLayoutScroll from core/ui/layoutScroll`);

  // 9. translations: a game that declares them has English and its dictionary file
  if (/translations:/.test(index)) {
    if (!/translations:\s*\{[^}]*\ben:/s.test(index)) problems.push(`${where}/index.ts: translations must include en`);
    if (!existsSync(join(root, 'i18n', 'en.ts')))
      problems.push(`${where}: translations declared but i18n/en.ts is missing`);
  }

  // 3. self-checks
  const selfChecks = files.filter((f) => f.endsWith('.check.ts'));
  if (!selfChecks.length) problems.push(`${where}: no *.check.ts self-check for its mock backend`);
  for (const c of selfChecks) {
    const relPath = rel(c);
    if (!checkScript.includes(relPath)) problems.push(`${relPath}: not listed in the package.json "check" script`);
  }
}

// 8. core independence (comments are ignored)
const stripComments = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
for (const f of walk(resolve('src/core')).filter((x) => /\.(ts|tsx)$/.test(x))) {
  const code = stripComments(text(f));
  // self-checks (*.check.ts) are exempt: i18n.check.ts deliberately loads every game's dictionary
  const imports = f.endsWith('.check.ts') ? [] : [...code.matchAll(IMPORT_SPEC)].map((m) => m[1]);
  if (imports.some((spec) => /^(games\/|(\.\.\/)+games\/)/.test(spec))) problems.push(`${rel(f)}: core imports a game`);
  for (const id of ids)
    if (new RegExp(`\\b${id}\\b`, 'i').test(code)) problems.push(`${rel(f)}: core names the game "${id}"`);
}

// @game is the running game's entry, wired up only by the app shell
for (const f of walk(resolve('src')).filter((x) => /\.(ts|tsx)$/.test(x)))
  if (
    !['src/main.tsx', 'src/game.d.ts'].includes(rel(f)) &&
    [...stripComments(text(f)).matchAll(IMPORT_SPEC)].some((m) => m[1] === '@game')
  )
    problems.push(`${rel(f)}: imports @game (only src/main.tsx and src/game.d.ts may)`);

if (problems.length) {
  console.error(`check:games found ${problems.length} problem(s):\n- ${problems.join('\n- ')}`);
  process.exit(1);
}
console.log(`check:games: ok (${ids.join(', ')})`);
