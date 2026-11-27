// Sounds for Card Pick (core/audio, loaded lazily by useSound; React owns the controls). Each entry is a file name without its
// extension: <name>.mp3 in public/assets/cardpick/sounds/mp3/ and <name>.ogg in .../ogg/. The screen reports events with
// sound.manager.handle('PICK'); an entry plays on the events in playEvents.
import type { SoundGameConfig } from 'core/audio/SoundConfig';

export const cardpickSounds = {
  soundPath: 'cardpick/sounds/',
  soundFiles: [
    { name: 'pick', playEvents: ['PICK'] },
    { name: 'reveal', playEvents: ['REVEAL'] },
  ],
} satisfies SoundGameConfig;
