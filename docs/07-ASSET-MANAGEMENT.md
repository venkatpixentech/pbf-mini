# 07. Asset management

Where shared and game assets live, how they are addressed, versioned, built and loaded, and the rules that
keep them small.

## Where assets live

| Location | What | How it is served |
|---|---|---|
| `src/core/assets/fonts/*.woff2` | PBF fonts: Degular Black/Bold, Avenir Next Regular/Demi/Bold (lossless WOFF2 conversions of PBF's TTF/OTF) | Imported from `src/styles.css`; Vite hashes the files (immutable caching, correct URL at any path) |
| `src/core/assets/desktopBg.png` | Desktop background around the phone column | Same; requested only on screens wider than 768 px, after `pbf:playable` |
| `public/assets/common/` | Shared art: `icon/` (stat icons), `images/countryIcons/` (flags) | Copied into every build; addressed with `assetUrl()` |
| `public/assets/<id>/` | One game's own art (today: `higherlower/images/badges.{json,png}`) | Copied only into that game's build |

**Rule for a new file (two pipelines, by design):** a file referenced from CSS (fonts, backgrounds) goes in
`src/core/assets`; a file loaded by URL at runtime (React images, Pixi textures) goes in `public/assets/common`
or `public/assets/<id>`. Both are cache-safe: Vite hashes the first kind, `assetUrl()` adds `?v=` to the second.

`accacrash` and `lastmanstanding` have empty asset folders (kept with `.gitkeep`; `npm run new-game` creates
one per game). Original art comes from the PBF reference project, copied read-only; the PBF project is never
edited.

## Addressing: `assetUrl()`

`src/core/boot/assetUrl.ts`:

```ts
assetUrl('common/images/countryIcons/BrazilIcon.svg')
// -> ./assets/common/images/countryIcons/BrazilIcon.svg?v=1a2b3c4d   (build)
```

- Relative to the page (`import.meta.env.BASE_URL` is `./`), so a build works from a domain root or any
  subfolder. Never write `/assets/...` in code or CSS: a subfolder deployment used to fail completely.
- `?v=` is an 8-character content hash computed at build time (`assetVersions()` in `vite.config.ts`,
  exposed as `__ASSET_VERSIONS__`). A changed file gets a new URL, so the host can cache these files as
  immutable. Pixi strips the query when it detects the file type.
- In dev there are no versions (`?v=` is omitted).

## Build

`vite.config.ts` plugin `game-assets`: `publicDir` is off for builds, and after bundling it copies
`public/assets/common` plus `public/assets/<GAME_ID>` into `../pbf-game-builds/<id>/assets/`. A build never
contains another game's art.

## Caching (host configuration)

| Files | Header |
|---|---|
| `index.html` | `Cache-Control: no-cache` |
| Hashed JS, CSS, fonts, desktop background | `public, max-age=31536000, immutable` |
| `public/assets/**` requested with `?v=` | the same immutable header (needs a host rule matching the `v` query) |
| Images referenced from inside a JSON atlas (`badges.png`) | revalidate (ETag); Pixi resolves them relative to the JSON, without `?v=` |

Without the `?v=` rule, warm loads revalidate every asset (one 304 round trip each): that cost up to 2 s on
Slow 4G before the change (doc 05).

## Loading

- Pixi assets the first screen draws go in `defineGame({ preload })`; the boot loads them through
  `core/pixi/preload.ts` (bounded concurrency, retry, timeout). Stages list their own `assets`; those are
  ref counted per alias (`core/pixi/stageAssets.ts`), so a texture shared by two stages survives one of them
  unmounting, and are released on unmount.
- DOM images (`<img>`) use `assetUrl()` too (Acca Crash flags).
- Everything not needed for the first screen loads after `pbf:playable`.

## Size rules (with the measured reasons)

| Rule | Why |
|---|---|
| Ship only the frames a game draws: cut a game atlas instead of loading a shared one | HL loaded a 150 KB, 1229x2032 atlas (a 10 MB GPU texture) for three 60x97 badges; the cut atlas is 28 KB PNG, lossless |
| Optimise SVGs (SVGO, float precision 2) | Spain flag 55.6 to 19.8 KB gz, Portugal 13.4 to 5.4, Brazil 7.9 to 2.7; visually identical at display size |
| WOFF2 for fonts | 162 to 119 KB for the four critical weights |
| Decorative files load after playable | the desktop background (52 KB) used to compete with critical files |
| Frame names must be unique across all atlases | Pixi registers spritesheet frame names globally; the same name in two atlases collides (not enforced by a check) |

## Known limitations and pending work

- Each game build has its own copy of `common`, fonts and React at its own path, so a player switching
  games downloads them again. A shared path for common files across games needs host support.
- No font subsetting yet (would save roughly 40 to 50% of font bytes; needs the glyph list per language).
- No sound assets or sound loading rules exist yet.
- `TurkeyIcon.svg` embeds a PNG (14 KB gz); SVGO cannot shrink it.
- Unreferenced atlases in the original PBF game (about 7.6 MB) are outside this repository; they need art
  sign-off before any removal there.
