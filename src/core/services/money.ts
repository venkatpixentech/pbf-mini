// Money helpers. Amounts are numbers in currency units, always rounded to 2 decimals at the edges.
// Compare and round here instead of comparing raw floats or strings (PBF compared stakes as strings, doc 01 D2).

export const roundMoney = (amount: number): number => Math.round((amount + Number.EPSILON) * 100) / 100;

/** -1, 0 or 1 after rounding both sides, so 0.1 + 0.2 equals 0.3. */
export const compareMoney = (a: number, b: number): number => Math.sign(roundMoney(a) - roundMoney(b));

export function formatMoney(amount: number, currency = 'GBP', locale = 'en-GB'): string {
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(roundMoney(amount));
}
