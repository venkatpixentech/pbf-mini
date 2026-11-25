// URLs for files under public/assets, valid at any deployment path (the build uses base './').
// Each URL carries ?v=<content hash> (computed at build time in vite.config.ts), so a host can cache
// these files as immutable: a changed file gets a new URL, an unchanged one never needs revalidating.

declare const __ASSET_VERSIONS__: Record<string, string>;

const ROOT = `${import.meta.env.BASE_URL}assets/`;
const versions: Record<string, string> = typeof __ASSET_VERSIONS__ === 'undefined' ? {} : __ASSET_VERSIONS__;

/** `src` is relative to public/assets, e.g. 'common/images/countryIcons/BrazilIcon.svg'. */
export function assetUrl(src: string): string {
  const v = versions[src];
  return v ? `${ROOT}${src}?v=${v}` : ROOT + src;
}
