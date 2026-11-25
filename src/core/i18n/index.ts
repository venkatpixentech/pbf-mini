// Translation store, shared by React text and Pixi text (docs/08-I18N-TRANSLATIONS.md).
//   - one language per page, chosen from the launch parameter (lang / language), English fallback
//   - a shared dictionary (core) plus an independent dictionary per game, loaded for the selected language only
//   - live switching: setLanguage() loads the dictionaries, swaps them and notifies subscribers (React hooks,
//     PixiStage relabelling); no page reload
//   - missing keys are reported once each (development console by default, replaceable for tests)
// Plain TypeScript with no React and no Pixi, so it can be used anywhere and checked in Node.
import { setMoneyLocale } from '../services/money.ts';
import coreEn from './en.ts';
import { pseudoDictionary } from './pseudo.ts';

export type Dictionary = Readonly<Record<string, string>>;
export type DictionaryLoader = () => Promise<{ default: Dictionary }>;
export type Vars = Record<string, string | number>;

/** Where dictionaries come from. `en` is built in for the core; every other language is a dynamic import. */
export type I18nSources = {
  /** Extra core languages beyond built-in English, e.g. { fr: () => import('./fr') }. */
  core?: Record<string, DictionaryLoader>;
  /** The game's dictionaries. Must include `en` when present. */
  game?: Record<string, DictionaryLoader>;
};

export const PSEUDO_LANGUAGE = 'xx';
const LOCALES: Record<string, string> = { en: 'en-GB', [PSEUDO_LANGUAGE]: 'en-GB' };

let language = 'en';
let selected: Dictionary = coreEn;
let base: Dictionary = coreEn; // English: the fallback
let sources: I18nSources = {};
const listeners = new Set<() => void>();
const reported = new Set<string>();
let onMissing: (message: string) => void = (message) => {
  if ((import.meta as { env?: { DEV?: boolean } }).env?.DEV) console.warn(`[i18n] ${message}`);
};

/** Replaces how missing keys are reported (the default is a development-only console warning). */
export function setMissingKeyHandler(handler: (message: string) => void) {
  onMissing = handler;
  reported.clear();
}

const report = (message: string) => {
  if (reported.has(message)) return;
  reported.add(message);
  onMissing(message);
};

/** `en-GB` and `EN` become `en`. */
export const normalizeLanguage = (requested: string | null | undefined): string =>
  (requested ?? 'en').trim().toLowerCase().split(/[-_]/)[0] || 'en';

export const localeOf = (lang: string): string => LOCALES[lang] ?? lang;

const interpolate = (text: string, vars?: Vars): string =>
  text.replace(/\{([A-Za-z0-9_]+)\}/g, (whole, name: string) => {
    if (vars && name in vars) return String(vars[name]);
    report(`value "${name}" not provided for "${text}"`);
    return whole;
  });

/** Looks a key up in the selected language, then in English; an unknown key returns itself. */
export function translate(key: string, vars?: Vars): string {
  let text = selected[key];
  if (text === undefined) {
    if (language !== 'en') report(`key "${key}" is missing in "${language}", using English`);
    text = base[key];
  }
  if (text === undefined) {
    report(`key "${key}" does not exist`);
    return key;
  }
  return interpolate(text, vars);
}

/** True when `text` is a known dictionary key (used to accept either a key or plain text). */
export const hasKey = (text: string): boolean => text in selected || text in base;

const load = async (loaders: Record<string, DictionaryLoader> | undefined, lang: string): Promise<Dictionary> =>
  loaders?.[lang] ? (await loaders[lang]()).default : {};

async function buildDictionaries(lang: string, from: I18nSources) {
  const english = { ...coreEn, ...(await load(from.game, 'en')) };
  if (lang === 'en') return { base: english, selected: english };
  if (lang === PSEUDO_LANGUAGE) return { base: english, selected: pseudoDictionary(english) };
  const [core, game] = await Promise.all([load(from.core, lang), load(from.game, lang)]);
  return { base: english, selected: { ...core, ...game } };
}

/** Languages the sources can serve (plus the pseudo test language). */
export const availableLanguages = (from: I18nSources = sources): string[] => [
  ...new Set(['en', PSEUDO_LANGUAGE, ...Object.keys(from.core ?? {}), ...Object.keys(from.game ?? {})]),
];

/** Chooses the language to use for a request: the requested one when available, else English. */
export function resolveLanguage(requested: string | null | undefined, from: I18nSources = sources): string {
  const lang = normalizeLanguage(requested);
  return availableLanguages(from).includes(lang) ? lang : 'en';
}

/** Registers the sources and activates a language. Resolves to the language actually used. */
export async function initI18n(requested: string | null | undefined, from: I18nSources): Promise<string> {
  sources = from;
  return activate(resolveLanguage(requested, from));
}

/** Switches language without a reload. Unknown languages fall back to English. Resolves to the language used. */
export async function setLanguage(requested: string | null | undefined): Promise<string> {
  return activate(resolveLanguage(requested, sources));
}

let switching = 0;
async function activate(lang: string): Promise<string> {
  const ticket = ++switching;
  const dictionaries = await buildDictionaries(lang, sources).catch((error: unknown) => {
    report(`could not load language "${lang}": ${String(error)}; using English`);
    return null;
  });
  if (ticket !== switching) return language; // a newer switch won
  const next = dictionaries ? lang : 'en';
  const d = dictionaries ?? { base: coreEn, selected: coreEn };
  language = next;
  base = d.base;
  selected = d.selected;
  setMoneyLocale(localeOf(next));
  if (typeof document !== 'undefined') document.documentElement.lang = next === PSEUDO_LANGUAGE ? 'en' : next;
  listeners.forEach((listener) => listener());
  return next;
}

export const getLanguage = (): string => language;

/** Calls `listener` after every language switch. Returns the unsubscribe function. */
export function onLanguageChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Numbers in the selected language's format. */
export const formatNumber = (value: number, options?: Intl.NumberFormatOptions): string =>
  new Intl.NumberFormat(localeOf(language), options).format(value);

export type { CoreKey } from './en.ts';
