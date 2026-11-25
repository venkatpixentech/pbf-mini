// React side of the translation system: hooks that re-render when the language switches, and a typed
// translator factory for a game's own dictionary.
import { useSyncExternalStore } from 'react';

import { type CoreKey, type Dictionary, getLanguage, onLanguageChange, translate, type Vars } from './index.ts';

/** The selected language; the component re-renders when it changes. */
export const useLanguage = (): string => useSyncExternalStore(onLanguageChange, getLanguage);

/** Translator for the shared (core) keys. */
export function useCoreT() {
  useLanguage();
  return (key: CoreKey, vars?: Vars) => translate(key, vars);
}

/**
 * Typed translator for one game: keys are the game's own dictionary keys plus the shared core keys, checked at
 * compile time. Call once in the game's `i18n/index.ts`:
 *
 *   import type en from './en';
 *   export const { t, useT } = makeTranslator<typeof en>();
 *
 * `useT()` is for React components (re-renders on a language switch); `t` is for non-React code such as Pixi
 * scenes (subscribe with onLanguageChange to redraw).
 */
export function makeTranslator<Game extends Dictionary>() {
  type Key = (keyof Game & string) | CoreKey;
  const t = (key: Key, vars?: Vars): string => translate(key, vars);
  const useT = () => {
    useLanguage();
    return t;
  };
  return { t, useT };
}
