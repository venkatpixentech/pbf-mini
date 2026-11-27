// Self-check: node --experimental-strip-types --no-warnings src/games/cardpick/sound/sound.check.ts
// The sound config is valid and every file it names exists in both formats.
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';

import { validateSoundConfig } from '../../../core/audio/SoundConfig.ts';
import { cardpickSounds } from './sound.config.ts';

validateSoundConfig(cardpickSounds, 'cardpickSounds');
for (const s of cardpickSounds.soundFiles) {
  if (s.langEnabled) continue; // per-language variants are named <name><language>
  for (const ext of ['mp3', 'ogg']) {
    const path = cardpickSounds.soundPath + ext + '/' + s.name + '.' + ext;
    assert.ok(existsSync(new URL('../../../../public/assets/' + path, import.meta.url)), 'missing sound file: ' + path);
  }
}

console.log('cardpick sound.check: ok');
