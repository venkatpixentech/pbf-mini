// The audio panel of the harness: the game's React side of sound. It uses the shared hooks, shows the user's settings with plain
// React controls (mute, volume, sound effects, ambient), and turns "events" into sounds through SoundManager.handle, the way a
// game screen does with its scene events. `window.__audio` lets the browser test measure what is playing.
import { useEffect, useState } from 'react';

import type { SoundGameConfig } from 'core/audio/SoundConfig';
import { useSound, useSoundSettings } from 'core/audio/react';

const START = 'Matchmaking_Start Button';
const WHOOSH = 'Matchmaking_Whoosh in';
const LOOP = 'Total Win_loop';
const TWO = 'Ambient_two';

const config: SoundGameConfig = {
  soundPath: 'audioprobe/sounds/',
  soundFiles: [
    { name: START, volume: 1, playEvents: ['START'], stopEvents: ['STOP'], fadeOutDuration: 200 },
    { name: WHOOSH, dontStopInstances: true, playEvents: ['MATCH'], matchParam: 'yes' },
    {
      name: LOOP,
      type: 'ambient',
      loop: true,
      resumePreviousSound: true,
      fadeInDuration: 200,
      fadeOutDuration: 300,
      playEvents: ['AMBIENT'],
      stopEvents: ['AMBIENT_OFF'],
    },
    { name: TWO, type: 'ambient', loop: true, playEvents: ['AMBIENT_TWO'] },
  ],
};

const key = new URLSearchParams(location.search).get('key') ?? 'audioprobe';
const options = { storageKey: key };

declare global {
  interface Window {
    __audio: {
      sound: ReturnType<typeof useSound>;
      /** The largest swing of the output over `ms` milliseconds (0 is silence). */
      peak(ms?: number): Promise<number>;
    };
  }
}

export default function AudioPanel() {
  const sound = useSound(config, options);
  const settings = useSoundSettings(sound?.service ?? null);
  const [events, setEvents] = useState(0);

  useEffect(() => {
    window.__audio = {
      sound,
      async peak(ms = 300) {
        const analyser = sound?.service.getAnalyser();
        if (!analyser) return 0;
        const data = new Uint8Array(analyser.fftSize);
        let best = 0;
        const end = performance.now() + ms;
        while (performance.now() < end) {
          analyser.getByteTimeDomainData(data);
          best = Math.max(best, Math.max(...data) - Math.min(...data));
          await new Promise((r) => setTimeout(r, 15));
        }
        return best;
      },
    };
  }, [sound]);

  if (!sound || !settings) return <p>starting audio</p>;
  const { service, manager } = sound;
  const send = (event: string, param?: string) => {
    manager.handle(event, param);
    setEvents((n) => n + 1);
  };
  return (
    <section>
      <p data-testid="state">
        state={settings.state} unlocked={String(settings.unlocked)} muted={String(settings.muted)} volume=
        {settings.volume.toFixed(2)} sfx={String(settings.sfx)} ambient={String(settings.ambient)} events={events}
      </p>
      <button data-testid="play-start" onClick={() => send('START')}>
        start
      </button>
      <button data-testid="stop-start" onClick={() => send('STOP')}>
        stop
      </button>
      <button data-testid="play-whoosh" onClick={() => send('MATCH', 'yes')}>
        whoosh
      </button>
      <button data-testid="play-whoosh-no" onClick={() => send('MATCH', 'no')}>
        whoosh (no match)
      </button>
      <button data-testid="play-ambient" onClick={() => send('AMBIENT')}>
        ambient
      </button>
      <button data-testid="play-ambient-two" onClick={() => send('AMBIENT_TWO')}>
        ambient two
      </button>
      <button data-testid="stop-ambient" onClick={() => send('AMBIENT_OFF')}>
        stop ambient
      </button>
      <button data-testid="stop-all" onClick={() => service.stopAll()}>
        stop all
      </button>
      <button data-testid="mute" aria-pressed={settings.muted} onClick={() => service.setMuted(!settings.muted)}>
        {settings.muted ? 'unmute' : 'mute'}
      </button>
      <label>
        volume
        <input
          data-testid="volume"
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={settings.volume}
          onChange={(e) => service.setVolume(Number(e.target.value))}
        />
      </label>
      <button data-testid="sfx" onClick={() => service.setSfx(!settings.sfx)}>
        sound effects {settings.sfx ? 'on' : 'off'}
      </button>
      <button data-testid="ambient" onClick={() => service.setAmbient(!settings.ambient)}>
        ambient {settings.ambient ? 'on' : 'off'}
      </button>
    </section>
  );
}
