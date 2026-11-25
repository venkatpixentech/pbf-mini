// Money helpers. Amounts are numbers in currency units, always rounded to 2 decimals at the edges.
// Compare and round here instead of comparing raw floats or strings (PBF compared stakes as strings: defect D2, docs/archive/plans-and-audits/01-ultimate-soccer-architecture-audit.md).

// Moves the decimal point by `places` using the digits JavaScript prints for the number, so no binary error creeps in.
const shift = (value: number, places: number): number => {
  const [digits, exponent = '0'] = String(value).split('e');
  return Number(`${digits}e${Number(exponent) + places}`);
};

/**
 * Rounds to 2 decimals, half away from zero, on the decimal digits JavaScript prints for the number (so 1.005 is a
 * half-cent and becomes 1.01, -1.005 becomes -1.01). Positive and negative amounts follow the same rule. Never
 * returns -0. NaN and Infinity are returned unchanged.
 */
export const roundMoney = (amount: number): number => {
  if (!Number.isFinite(amount)) return amount;
  const cents = Math.round(shift(Math.abs(amount), 2)); // Math.round on a non-negative value: half away from zero
  return cents === 0 ? 0 : Math.sign(amount) * shift(cents, -2);
};

/** -1, 0 or 1 after rounding both sides, so 0.1 + 0.2 equals 0.3. */
export const compareMoney = (a: number, b: number): number => Math.sign(roundMoney(a) - roundMoney(b));

let defaultLocale = 'en-GB';

/** The locale used when formatMoney is not given one. Set by the translation system when the language changes. */
export const setMoneyLocale = (locale: string) => {
  defaultLocale = locale;
};

const warned = new Set<string>();

/**
 * Formats an amount in a currency. Never throws: a currency code Intl does not accept (for example USDT or mBTC) is
 * shown as text after a 2-decimal number ("1,234.50 USDT"), with one console warning per code. Codes Intl accepts are
 * formatted exactly as Intl formats them.
 */
export function formatMoney(amount: number, currency = 'GBP', locale = defaultLocale): string {
  const value = roundMoney(amount);
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(value);
  } catch {
    if (!warned.has(currency)) {
      warned.add(currency);
      console.warn(`[money] "${currency}" is not a currency code Intl can format; showing it as text`);
    }
    const number = new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
    return `${number} ${currency}`.trim();
  }
}
