// Reads the production builds the browser tests run against (../pbf-game-builds/<name>), so a spec can assert what a build contains or
// leaves out. A plain module with a declaration file beside it (buildScan.d.mts): the specs are type-checked without Node's types.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = () => resolve(process.env.BUILD_DIR ?? '../pbf-game-builds');

const walk = (dir) =>
  !existsSync(dir)
    ? []
    : readdirSync(dir).flatMap((n) => {
        const p = join(dir, n);
        return statSync(p).isDirectory() ? walk(p) : [p];
      });

/** Every text file (js, css, html, json, txt) of a build, with its path relative to the build folder. */
export function textFiles(name) {
  const base = join(root(), name);
  return walk(base)
    .filter((f) => /\.(js|css|html|json|txt)$/.test(f))
    .map((f) => ({ file: f.slice(base.length + 1).replace(/\\/g, '/'), code: readFileSync(f, 'utf8') }));
}

/** Whether a file or folder exists in a build (a path relative to the build folder). */
export function hasPath(name, relative) {
  return existsSync(join(root(), name, relative));
}
