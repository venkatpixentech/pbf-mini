/* eslint-disable react-refresh/only-export-components -- a page entry, not a hot-reloaded module */
// The audio harness page (DOM only: no Pixi). It starts with one button; the audio panel and the audio service are loaded
// only when it is pressed, which is what the lazy-loading test watches. `?key=` names the saved settings.
import { lazy, Suspense, useState } from 'react';
import { createRoot } from 'react-dom/client';

const AudioPanel = lazy(() => import('./AudioPanel'));

function App() {
  // ?autoinit starts audio at load, before any gesture (the unlock tests need a page nobody has clicked yet)
  const [on, setOn] = useState(new URLSearchParams(location.search).has('autoinit'));
  return (
    <main>
      <button data-testid="init-audio" onClick={() => setOn(true)}>
        enable audio
      </button>
      <button data-testid="dispose-audio" onClick={() => setOn(false)}>
        remove audio
      </button>
      <Suspense fallback={<p>loading audio</p>}>{on && <AudioPanel />}</Suspense>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
