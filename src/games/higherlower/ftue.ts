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

export type FtueStep = { title: string; body: string; cta: string };

/** The real prototype's own 4-step coach copy (ftueCopy in the prototype's render()). */
export const FTUE_STEPS: FtueStep[] = [
  {
    title: 'Higher or lower?',
    body: 'Everyone sees the same player. The price changes with the player on screen. Lower rated cards are more likely to be followed by a higher one, while higher rated cards are more likely to be followed by a lower one.',
    cta: 'Got it',
  },
  { title: 'Beat the clock', body: 'Make your pick before the countdown reaches zero.', cta: 'Next' },
  {
    title: 'Build your streak',
    body: 'Choose Higher or Lower. Get it right and your current winnings are multiplied by the displayed price. Cash out during any countdown, or pick again to keep going.',
    cta: 'Next',
  },
  {
    title: 'Bigger move. Bigger price.',
    body: "Back the next player's OVR to move by at least 2 or 3 for a bigger price. Small moves are the most common, so these pay more.",
    cta: 'Play',
  },
];
