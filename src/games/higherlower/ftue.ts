// Splash + first-time tutorial, after the prototype's own `seen`/`ftueDone` localStorage flags.
// Purely a client-side first-run hint; never touches balance or round state.
const SEEN_KEY = 'pbf-hol:seen-v1';
const FTUE_KEY = 'pbf-hol:ftueDone-v1';

function readFlag(key: string): boolean {
  try {
    return localStorage.getItem(key) === '1';
  } catch {
    return true; // storage unavailable: don't block play on it
  }
}
function writeFlag(key: string): void {
  try {
    localStorage.setItem(key, '1');
  } catch {
    // ignore: a private window or blocked storage just means the splash/tutorial repeats next time
  }
}

export const hasSeenIntro = () => readFlag(SEEN_KEY);
export const markIntroSeen = () => writeFlag(SEEN_KEY);
export const hasFtueDone = () => readFlag(FTUE_KEY);
export const markFtueDone = () => writeFlag(FTUE_KEY);

import type { HolKey } from './i18n';

export type FtueStep = { title: HolKey; body: HolKey; cta: HolKey };

/** The prototype's 4-step coach: translation keys, the English copy is in i18n/en.ts. */
export const FTUE_STEPS: FtueStep[] = [1, 2, 3, 4].map((n) => ({
  title: `hol.ftue.${n}.title` as HolKey,
  body: `hol.ftue.${n}.body` as HolKey,
  cta: `hol.ftue.${n}.cta` as HolKey,
}));
