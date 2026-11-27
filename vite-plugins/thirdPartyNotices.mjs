// Ships the licence text of third-party code that ends up in a build. The minifier strips licence comments, and the
// Spine Runtimes License requires its notice to accompany redistributed products, so a build that contains the Spine
// runtime gets a THIRD-PARTY-NOTICES.txt next to index.html with the licence files of those packages.
// Add a package here when its licence asks for its notice to travel with the code.
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const PACKAGES = ['@esotericsoftware/spine-core', '@pixi/spine-pixi'];

export function thirdPartyNotices() {
  return {
    name: 'third-party-notices',
    apply: 'build',
    generateBundle(_options, bundle) {
      const modules = Object.values(bundle).flatMap((chunk) =>
        chunk.type === 'chunk' ? Object.keys(chunk.modules) : [],
      );
      const used = PACKAGES.filter((name) =>
        modules.some((id) => id.replaceAll('\\', '/').includes(`/node_modules/${name}/`)),
      );
      if (!used.length) return;
      const sections = used.map((name) => {
        const dir = resolve('node_modules', name);
        const pkg = JSON.parse(readFileSync(resolve(dir, 'package.json'), 'utf8'));
        const file = ['LICENSE', 'LICENSE.md', 'LICENSE.txt'].map((f) => resolve(dir, f)).find((f) => existsSync(f));
        return `${name} ${pkg.version}\n${'='.repeat(60)}\n${file ? readFileSync(file, 'utf8').trim() : '(no licence file found)'}`;
      });
      this.emitFile({
        type: 'asset',
        fileName: 'THIRD-PARTY-NOTICES.txt',
        source: `Third-party code included in this build\n\n${sections.join('\n\n')}\n`,
      });
    },
  };
}
