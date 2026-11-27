// Self-check: node --experimental-strip-types --no-warnings src/core/pixi/wrapper/PixDynamicSprite.check.ts
// Which image URLs may be loaded, and how an image is fitted into its rectangle.
import assert from 'node:assert/strict';

import { checkImageUrl, imageSizeInRect } from './PixDynamicSpriteStep.ts';

const base = 'https://game.example/play/index.html';
const allowed = ['https://images.example'];
const reason = (raw: string | null | undefined, list = allowed) => {
  const v = checkImageUrl(raw, base, list);
  return v.ok ? 'ok' : v.reason;
};

assert.equal(reason('player.png'), 'ok', 'relative: the page origin');
assert.equal(reason('/assets/a/player.JPG'), 'ok');
assert.equal(reason('https://images.example/cards/1.webp'), 'ok', 'an allowed origin');
assert.equal(
  reason('https://images.example/cards/1.png?size=2#x'),
  'ok',
  'a query and a hash are fine, the file name decides',
);
assert.equal(reason(''), 'empty');
assert.equal(reason(undefined), 'empty');
assert.equal(reason(null), 'empty');
assert.equal(reason('https://images.example/cards/'), 'extension', 'a bare folder (the legacy rule)');
assert.equal(reason('https://images.example/cards/1'), 'extension');
assert.equal(reason('https://images.example/cards/1.txt'), 'extension');
assert.equal(reason('https://evil.example/1.png'), 'origin', 'an origin that is not allowed');
assert.equal(reason('https://images.example/1.png', []), 'origin', 'no allowlist: only the page origin');
assert.equal(reason('javascript:alert(1).png'), 'scheme');
assert.equal(reason('file:///etc/passwd.png'), 'scheme');
assert.equal(reason('data:image/png;base64,AAAA'), 'scheme');
assert.equal(reason('https://user:pass@images.example/1.png'), 'invalid', 'credentials in a URL');
assert.equal(reason('http://[bad'), 'invalid');
assert.equal(checkImageUrl('player.png', base).ok, true);
const ok = checkImageUrl('x/player.png', base);
assert.ok(ok.ok && ok.url === 'https://game.example/play/x/player.png', 'the resolved URL is returned');

// fitting
assert.deepEqual(
  imageSizeInRect({ width: 200, height: 100 }, { width: 100, height: 100 }),
  { width: 100, height: 50 },
  'scaled down to fit',
);
assert.deepEqual(
  imageSizeInRect({ width: 50, height: 25 }, { width: 100, height: 100 }),
  { width: 100, height: 50 },
  'scaled up to fit',
);
assert.deepEqual(
  imageSizeInRect({ width: 200, height: 100 }, { width: 80, height: 60, isForced: true }),
  { width: 80, height: 60 },
  'forced: stretched',
);
const empty = imageSizeInRect({ width: 0, height: 0 }, { width: 100, height: 100 });
assert.ok(Number.isFinite(empty.width) && Number.isFinite(empty.height), 'an empty image never gives NaN');

console.log('PixDynamicSprite.check: ok');
