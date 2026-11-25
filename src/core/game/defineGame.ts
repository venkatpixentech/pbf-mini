import type { ComponentType } from 'react';

import type { LaunchParams } from 'core/boot/launchParams';
import type { StageAsset } from 'core/pixi/scene';

/** Session fields every game backend returns from init (the PBF Init core subset, doc 07 section 3). */
export type CoreInit = { balance: number; currency: string; stakes: number[] };

export type GameScreenProps<Api, Init> = { api: Api; init: Init; launch: LaunchParams };

/** What a game supplies. The core boots it, the game renders it. */
export type GameDefinition<Api extends { init(): Promise<Init> }, Init extends CoreInit> = {
  id: string;
  title: string;
  /** Pixi assets to load during boot, so the first screen appears complete. */
  preload: StageAsset[];
  createApi(launch: LaunchParams): Api;
  Screen: ComponentType<GameScreenProps<Api, Init>>;
};

/** Identity helper that keeps the game's own Api and Init types. */
export const defineGame = <Api extends { init(): Promise<Init> }, Init extends CoreInit>(
  def: GameDefinition<Api, Init>,
) => def;
