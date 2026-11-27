// Self-check: node --experimental-strip-types --no-warnings src/core/audio/Sound.check.ts
// Sound config validation, saved settings, file choice, gains and the play rules.
import assert from 'node:assert/strict';

import { type SoundGameConfig, validateSoundConfig } from './SoundConfig.ts';
import {
  DEFAULT_PREFS,
  formatOrder,
  groupGain,
  masterGain,
  matchingPlay,
  matchingStop,
  parsePrefs,
  planPlay,
  serializePrefs,
  soundFile,
} from './SoundStep.ts';

// config
const config: SoundGameConfig = {
  soundPath: 'g/sounds/',
  soundFiles: [
    { name: 'win', volume: 0.8, playEvents: ['DONE'], matchParam: 'win', stopEvents: ['START'] },
    {
      name: 'crowd',
      type: 'ambient',
      loop: true,
      resumePreviousSound: true,
      playEvents: ['START'],
      fadeInDuration: 300,
    },
    { name: 'hello', langEnabled: true },
  ],
};
validateSoundConfig(config);
const bad = (c: SoundGameConfig, why: RegExp) => assert.throws(() => validateSoundConfig(c), why);
bad({ ...config, soundPath: 'g/sounds' }, /slash/);
bad({ ...config, soundFiles: [{ name: '' }] }, /name is required/);
bad({ ...config, soundFiles: [{ name: 'a' }, { name: 'a' }] }, /duplicate/);
bad({ ...config, soundFiles: [{ name: 'a', volume: 2 }] }, /volume/);
bad({ ...config, soundFiles: [{ name: 'a', fadeInDuration: -1 }] }, /fadeInDuration/);
bad({ ...config, soundFiles: [{ name: 'a', resumePreviousSound: true }] }, /ambient/);
bad({ ...config, soundFiles: [{ name: 'a', matchParam: 1 }] }, /needs playEvents/);
bad({ ...config, soundFiles: [{ name: 'a', playEvents: [''] }] }, /empty name/);

// saved settings: defaults for anything missing, wrong or unreadable; a round trip keeps them
assert.deepEqual(parsePrefs(null), DEFAULT_PREFS);
assert.deepEqual(parsePrefs('not json'), DEFAULT_PREFS);
assert.deepEqual(parsePrefs('42'), DEFAULT_PREFS);
assert.deepEqual(parsePrefs('{"muted":"yes","volume":"loud"}'), DEFAULT_PREFS);
assert.deepEqual(parsePrefs('{"volume":5}').volume, 1);
assert.deepEqual(parsePrefs('{"volume":-2}').volume, 0);
const prefs = { muted: true, volume: 0.25, sfx: false, ambient: true };
assert.deepEqual(parsePrefs(serializePrefs(prefs)), prefs);

// gains
assert.equal(masterGain({ ...DEFAULT_PREFS, volume: 0.4 }), 0.4);
assert.equal(masterGain({ ...DEFAULT_PREFS, muted: true }), 0, 'muted is silence');
assert.equal(masterGain({ ...DEFAULT_PREFS, volume: NaN }), 1);
assert.equal(groupGain(true), 1);
assert.equal(groupGain(false), 0);

// formats and files: ogg first (the legacy order), mp3 when ogg is not supported, none when neither
assert.deepEqual(formatOrder({ ogg: true, mp3: true }), ['ogg', 'mp3']);
assert.deepEqual(formatOrder({ ogg: false, mp3: true }), ['mp3']);
assert.deepEqual(formatOrder({ ogg: false, mp3: false }), []);
assert.equal(soundFile(config.soundFiles[0], 'g/sounds/', 'en', 'ogg'), 'g/sounds/ogg/win.ogg');
assert.equal(
  soundFile(config.soundFiles[2], 'g/sounds/', 'fr', 'mp3'),
  'g/sounds/mp3/hellofr.mp3',
  'the language suffix, as the legacy loader',
);
assert.equal(soundFile(config.soundFiles[2], 'g/sounds/', '', 'mp3'), 'g/sounds/mp3/hello.mp3');

// what a new play must do first
const [win, crowd] = config.soundFiles;
const idle = { playing: new Map<string, number>(), ambient: undefined };
assert.deepEqual(planPlay(win, idle), { skip: false, stopSame: false, stopAmbient: undefined });
assert.equal(
  planPlay(win, { ...idle, playing: new Map([['win', 1]]) }).stopSame,
  true,
  'a retrigger stops the old instance',
);
assert.equal(
  planPlay({ ...win, dontStopInstances: true }, { ...idle, playing: new Map([['win', 1]]) }).stopSame,
  false,
  'overlap allowed',
);
assert.equal(planPlay(crowd, { ...idle, ambient: 'crowd' }).skip, true, 'the same ambient track keeps playing');
assert.equal(planPlay(crowd, { ...idle, ambient: 'other' }).stopAmbient, 'other', 'ambient is exclusive');
assert.equal(
  planPlay(win, { ...idle, ambient: 'crowd' }).stopAmbient,
  undefined,
  'a sound effect leaves the ambient track alone',
);

// events: matchParam routes by the event's parameter
assert.deepEqual(
  matchingPlay(config.soundFiles, 'DONE', 'win').map((s) => s.name),
  ['win'],
);
assert.deepEqual(matchingPlay(config.soundFiles, 'DONE', 'lose'), []);
assert.deepEqual(matchingPlay(config.soundFiles, 'DONE'), []);
assert.deepEqual(
  matchingPlay(config.soundFiles, 'START').map((s) => s.name),
  ['crowd'],
);
assert.deepEqual(
  matchingStop(config.soundFiles, 'START').map((s) => s.name),
  ['win'],
);
assert.deepEqual(matchingStop(config.soundFiles, 'NOPE'), []);

console.log('Sound.check: ok');
