import type { ReactNode } from 'react';

/**
 * Shared app frame (same sizing rules as PBF's own AppShell): on desktop the game is a centred
 * phone-width column (45vh, 55vh on short windows, max 480px) over a background; on phones it is
 * full width. Sizing is pure CSS (styles.css .app-shell / .app-frame), so it needs no resize
 * listeners. No PBF product logo here: this frame is shared by every game on the framework, not
 * just PBF-branded ones.
 */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="app-shell">
      <div className="app-frame">{children}</div>
      <div className="app-rotate" role="alert">
        Please rotate your device to portrait
      </div>
    </div>
  );
}
