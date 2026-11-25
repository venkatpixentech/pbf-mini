// npm run check:games   Structure rules every game must follow (docs/16-creating-a-new-game.md).
// 0. the folder name is lowercase letters and digits only, no hyphens or other special characters (e.g. accacrash)
// 1. a game is a folder under src/games with an index.ts that default-exports defineGame(...)
// 2. it never imports another game's files (shared code belongs in src/core)
// 3. it has a mock backend self-check (*.check.ts) that `npm run check` actually runs
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';

const gamesDir = resolve('src/games');
const ids = readdirSync(gamesDir).filter((d) => statSync(join(gamesDir, d)).isDirectory());
const checkScript = JSON.parse(readFileSync('package.json', 'utf8')).scripts.check ?? '';
const problems = [];
const rel = (f) => relative('.', f).replaceAll(sep, '/');

const walk = (dir) =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });

for (const id of ids) {
  const root = join(gamesDir, id);
  const files = walk(root);
  const where = `src/games/${id}`;

  if (!/^[a-z][a-z0-9]*$/.test(id))
    problems.push(`${where}: folder name must be lowercase letters and digits only (no capitals, hyphens, spaces or other special characters)`);

  if (!existsSync(join(root, 'index.ts'))) problems.push(`${where}: no index.ts (paused or unfinished game)`);
  else if (!/export default defineGame\(/.test(readFileSync(join(root, 'index.ts'), 'utf8')))
    problems.push(`${where}/index.ts: must \`export default defineGame({...})\``);

  for (const file of files.filter((f) => /\.(ts|tsx)$/.test(f))) {
    for (const [, spec] of readFileSync(file, 'utf8').matchAll(/from\s+['"]([^'"]+)['"]/g)) {
      const target = spec.startsWith('.') ? resolve(dirname(file), spec) : spec.startsWith('games/') ? resolve('src', spec) : null;
      if (!target) continue;
      const other = ids.find((o) => o !== id && `${rel(target)}/`.startsWith(`src/games/${o}/`));
      if (other) problems.push(`${file.replace(resolve('.') + '\\', '')}: imports game "${other}" (move shared code to src/core)`);
    }
  }

  const selfChecks = files.filter((f) => f.endsWith('.check.ts'));
  if (!selfChecks.length) problems.push(`${where}: no *.check.ts self-check for its mock backend`);
  for (const c of selfChecks) {
    const relPath = rel(c);
    if (!checkScript.includes(relPath)) problems.push(`${relPath}: not listed in the package.json "check" script`);
  }
}

if (problems.length) {
  console.error(`check:games found ${problems.length} problem(s):\n- ${problems.join('\n- ')}`);
  process.exit(1);
}
console.log(`check:games: ok (${ids.join(', ')})`);
