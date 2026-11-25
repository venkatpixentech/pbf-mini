import type { ComponentType } from 'react';

import type { LaunchParams } from 'core/boot/launchParams';
import type { DictionaryLoader } from 'core/i18n';
import type { StageAsset } from 'core/pixi/scene';

/** Session fields every game backend returns from init (the PBF Init core subset, docs/09-BACKEND-INTEGRATION.md). */
export type CoreInit = { balance: number; currency: string; stakes: number[] };

export type GameScreenProps<Api, Init> = { api: Api; init: Init; launch: LaunchParams };

/** What a game supplies. The core boots it, the game renders it. */
export type GameDefinition<Api extends { init(): Promise<Init> }, Init extends CoreInit> = {
  id: string;
  title: string;
  /**
   * 'pixi': the first screen has a Pixi stage marked `critical`; the boot warms the renderer early and keeps
   * the loading overlay until that stage has drawn. 'dom': plain React, Pixi is never loaded by the boot.
   */
  renderer: 'pixi' | 'dom';
  /**
   * The game's own translation dictionaries, one dynamic import per language (how translations work: src/core/i18n/index.ts):
   * `{ en: () => import('./i18n/en') }`. Must include `en`, the fallback. Only the selected language is loaded.
   */
  translations?: { en: DictionaryLoader } & Record<string, DictionaryLoader>;
  /** Assets the first screen needs (Pixi games), loaded during boot. Everything else loads on demand. */
  preload: StageAsset[];
  createApi(launch: LaunchParams): Api;
  /**
   * The game screen, as a dynamic import, e.g. `() => import('./MyScreen').then((m) => m.MyScreen)`.
   * The boot starts it at the same time as the session call and asset loading, so screen code (and Pixi,
   * for a Pixi game) downloads in parallel instead of delaying the loader.
   */
  loadScreen(): Promise<ComponentType<GameScreenProps<Api, Init>>>;
};

/** Identity helper that keeps the game's own Api and Init types. */
export const defineGame = <Api extends { init(): Promise<Init> }, Init extends CoreInit>(
  def: GameDefinition<Api, Init>,
) => def;
