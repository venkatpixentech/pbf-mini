// Pseudo-language `xx`: a TEST language, not a translation. It is generated from the English dictionaries
// (accented letters, wrapped in brackets, about 30% longer) so that
//   - text that was never put through the translation system stands out (it stays plain English),
//   - layouts can be checked against longer text,
//   - the language machinery (selection, fallback, live switching, React and Pixi text) can be tested
//     without claiming any real translation.
// `{name}` placeholders are preserved.

const MAP: Record<string, string> = {
  a: 'á',
  e: 'é',
  i: 'í',
  o: 'ó',
  u: 'ú',
  y: 'ý',
  c: 'ç',
  n: 'ñ',
  A: 'Á',
  E: 'É',
  I: 'Í',
  O: 'Ó',
  U: 'Ú',
  Y: 'Ý',
  C: 'Ç',
  N: 'Ñ',
};

export function pseudo(text: string): string {
  const out = text
    .split(/(\{[A-Za-z0-9_]+\})/)
    .map((part) => (part.startsWith('{') ? part : part.replace(/[A-Za-z]/g, (ch) => MAP[ch] ?? ch)))
    .join('');
  const pad = '~'.repeat(Math.ceil(text.replace(/\{[A-Za-z0-9_]+\}/g, '').length * 0.3));
  return `[${out}${pad}]`;
}

export function pseudoDictionary(dictionary: Readonly<Record<string, string>>): Record<string, string> {
  return Object.fromEntries(Object.entries(dictionary).map(([key, value]) => [key, pseudo(value)]));
}
