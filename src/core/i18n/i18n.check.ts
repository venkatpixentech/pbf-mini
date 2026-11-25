// Self-check for the translation system: node --experimental-strip-types src/core/i18n/i18n.check.ts
// Covers lookup, interpolation, English fallback, missing-key detection, the pseudo language, live switching,
// number and money formatting, and that every translation key used in game code exists in its dictionary.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { formatMoney } from '../services/money.ts';
import coreEn from './en.ts';
import {
  availableLanguages,
  formatNumber,
  getLanguage,
  hasKey,
  initI18n,
  localeOf,
  normalizeLanguage,
  onLanguageChange,
  PSEUDO_LANGUAGE,
  resolveLanguage,
  setLanguage,
  setMissingKeyHandler,
  translate,
} from './index.ts';
import { pseudo } from './pseudo.ts';

const assert = (ok: boolean, message: string) => {
  if (!ok) throw new Error(`i18n.check: ${message}`);
};

const missing: string[] = [];
setMissingKeyHandler((m) => missing.push(m));

// a test game dictionary with an extra real-looking language to exercise fallback
const gameEn = { 'g.hello': 'Hello {name}', 'g.only': 'Only in English' };
const gameFr = { 'g.hello': 'Bonjour {name}' };
const sources = {
  core: { fr: async () => ({ default: { 'common.reload': 'Recharger' } }) },
  game: { en: async () => ({ default: gameEn }), fr: async () => ({ default: gameFr }) },
};

// 1. English: lookup and interpolation
assert((await initI18n('en', sources)) === 'en', 'initI18n returns the language used');
assert(translate('common.reload') === 'Reload', 'core key');
assert(translate('g.hello', { name: 'Sam' }) === 'Hello Sam', 'game key with a value');
assert(translate('common.loading', { percent: 40 }) === 'Loading 40%', 'core key with a number');
assert(hasKey('g.hello') && !hasKey('nope'), 'hasKey');

// 2. missing keys and missing values are reported once each, and do not throw
assert(translate('does.not.exist') === 'does.not.exist', 'unknown key returns itself');
translate('does.not.exist');
assert(missing.filter((m) => m.includes('does.not.exist')).length === 1, 'a missing key is reported once');
assert(translate('g.hello') === 'Hello {name}', 'a missing value leaves the placeholder');
assert(
  missing.some((m) => m.includes('"name" not provided')),
  'a missing value is reported',
);

// 3. another language: own text, English fallback for the rest
assert((await setLanguage('fr')) === 'fr', 'switching to a language with dictionaries');
assert(translate('g.hello', { name: 'Sam' }) === 'Bonjour Sam', 'game text in the selected language');
assert(translate('common.reload') === 'Recharger', 'core text in the selected language');
assert(translate('g.only') === 'Only in English', 'falls back to English');
assert(
  missing.some((m) => m.includes('"g.only" is missing in "fr"')),
  'the fallback is reported',
);
assert(translate('common.stake') === 'Stake', 'core key missing in the language falls back to English');

// 4. language selection
assert(
  normalizeLanguage('EN-gb') === 'en' && normalizeLanguage(null) === 'en' && normalizeLanguage('pt_BR') === 'pt',
  'normalizeLanguage',
);
assert(
  resolveLanguage('fr', sources) === 'fr' && resolveLanguage('de', sources) === 'en',
  'unknown language falls back to English',
);
assert(availableLanguages(sources).join() === ['en', PSEUDO_LANGUAGE, 'fr'].join(), 'available languages');

// 5. pseudo language: generated from English, placeholders kept, never a real translation
assert((await setLanguage(PSEUDO_LANGUAGE)) === PSEUDO_LANGUAGE, 'pseudo language');
const shown = translate('g.hello', { name: 'Sam' });
assert(shown.startsWith('[') && shown.endsWith(']') && shown.includes('Sam') && shown !== 'Hello Sam', 'pseudo text');
assert(pseudo('Loading {percent}%').includes('{percent}'), 'pseudo keeps placeholders');
assert(translate('common.loading', { percent: 7 }).includes('7%'), 'pseudo with a value');

// 6. live switching notifies subscribers
let notified = 0;
const off = onLanguageChange(() => notified++);
await setLanguage('en');
await setLanguage('fr');
off();
await setLanguage('en');
assert(notified === 2 && getLanguage() === 'en', 'listeners are called once per switch and unsubscribe works');

// 7. numbers and money follow the language's locale
assert(localeOf('en') === 'en-GB' && localeOf('de') === 'de', 'locales');
await setLanguage('en');
assert(formatMoney(1234.5, 'GBP') === '£1,234.50', 'money in English');
assert(formatNumber(1234.5) === '1,234.5', 'number in English');
assert(formatMoney(1234.5, 'GBP', 'de-DE').includes('1.234,50'), 'an explicit locale still wins');

// 8. a failing dictionary loader falls back to English and does not throw
const broken = {
  game: { en: gameEn && (async () => ({ default: gameEn })), xx2: async () => Promise.reject(new Error('offline')) },
};
await initI18n('en', broken);
assert((await setLanguage('xx2')) === 'en', 'a failed load falls back to English');

// 9. every translation key used in game code exists in the game's dictionary
const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
const gamesDir = 'src/games';
let checked = 0;
for (const id of readdirSync(gamesDir)) {
  let dict: Record<string, string>;
  try {
    dict = (await import(`../../games/${id}/i18n/en.ts`)).default as Record<string, string>;
  } catch {
    continue; // this game has no dictionary yet
  }
  const prefixes = new Set(Object.keys(dict).map((k) => k.split('.')[0]));
  const all = { ...coreEn, ...dict } as Record<string, string>;
  for (const file of walk(join(gamesDir, id)).filter(
    (f) => /\.(ts|tsx)$/.test(f) && !f.includes(`${join(id, 'i18n')}`),
  )) {
    for (const [, key] of readFileSync(file, 'utf8').matchAll(
      /['"`]((?:common|[a-z]+)\.[A-Za-z0-9_.]*[A-Za-z0-9_])['"`]/g,
    )) {
      const prefix = key.split('.')[0];
      if (prefix !== 'common' && !prefixes.has(prefix)) continue; // not a translation key
      checked++;
      assert(key in all, `${file}: translation key "${key}" is not in the dictionary`);
    }
  }
  // other languages must cover every English key (a real translation that misses keys falls back to English)
  for (const file of readdirSync(join(gamesDir, id, 'i18n')).filter(
    (f) => f.endsWith('.ts') && !['en.ts', 'index.ts'].includes(f),
  )) {
    const other = (await import(`../../games/${id}/i18n/${file}`)).default as Record<string, string>;
    const lacking = Object.keys(dict).filter((k) => !(k in other));
    assert(lacking.length === 0, `${id}/i18n/${file} lacks ${lacking.length} keys: ${lacking.slice(0, 3).join(', ')}`);
  }
}
assert(checked > 0, 'checked at least one used key');

console.log(
  `i18n.check: ok (lookup, values, fallback, missing keys, pseudo language, live switch, formats, ${checked} used keys exist)`,
);
process.exit(0);
