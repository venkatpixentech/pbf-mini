// Launch parameters, read the way PBF reads them: operators open the game with a query string in the URL
// (PBF reads it from the hash, `#/home?token=...`); the plain query string is accepted too.
// The token is passed to the backend only; it is never logged or stored.

export type LaunchParams = {
  token: string | null;
  language: string;
  currency: string | null; // null: the backend decides
  lobbyUrl: string | null;
  bankingUrl: string | null;
};

export function readLaunchParams(location: { search: string; hash: string } = window.location): LaunchParams {
  const hashQuery = location.hash.includes('?') ? location.hash.slice(location.hash.indexOf('?') + 1) : '';
  const q = new URLSearchParams(location.search);
  new URLSearchParams(hashQuery).forEach((value, key) => q.set(key, value)); // hash wins, as in PBF
  const url = (key: string) => {
    const value = q.get(key);
    return value && /^https:\/\//.test(value) ? value : null; // only https links are honoured
  };
  return {
    token: q.get('token'),
    language: q.get('lang') ?? q.get('language') ?? 'en',
    currency: q.get('currency')?.toUpperCase() ?? null,
    lobbyUrl: url('lobbyUrl'),
    bankingUrl: url('bankingUrl'),
  };
}
