import './styles.css';

import game from '@game';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { GameBoot } from 'core/boot/GameBoot';

// One shared entry; `@game` is the game chosen at dev/build time (GAME_ID), so each build contains one game.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <GameBoot game={game} />
  </StrictMode>,
);
