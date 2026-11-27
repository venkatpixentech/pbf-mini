// The host page of the host harness. It embeds the game in an iframe (`child=` is the game's full URL, on another origin) and records
// every message the game posts to it, with the sender's origin and whether it came from the game's window. `rogue=` is a list of
// extra frame URLs (other origins, or the host's own) that a test drives to post messages at the game.
const q = new URLSearchParams(location.search);

type Seen = { origin: string; fromGame: boolean; data: unknown };
declare global {
  interface Window {
    __host: { seen: Seen[]; send(data: unknown, targetOrigin: string): void; game: HTMLIFrameElement };
  }
}

const game = document.getElementById('game') as HTMLIFrameElement;
const seen: Seen[] = [];
window.addEventListener('message', (e) =>
  seen.push({ origin: e.origin, fromGame: e.source === game.contentWindow, data: e.data }),
);
window.__host = { seen, game, send: (data, targetOrigin) => game.contentWindow!.postMessage(data, targetOrigin) };

const rogues = document.getElementById('rogues')!;
for (const url of (q.get('rogue') ?? '').split('|').filter(Boolean)) {
  const f = document.createElement('iframe');
  f.title = 'rogue';
  f.src = url;
  rogues.appendChild(f);
}
game.src = q.get('child') ?? 'about:blank';

export {};
