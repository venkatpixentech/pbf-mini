import type { Application, Container } from 'pixi.js';

/** Everything a scene may use. Scenes never import React, stores, services or Apollo. */
export interface SceneContext<E> {
  app: Application;
  root: Container;
  /** Report to React. The only way out of a scene. */
  emit(event: E): void;
  /** Register a cleanup (listener, tween, timer). PixiStage runs all of them on unmount. */
  track(dispose: () => void): void;
}

/** One gameplay surface or one effect. Driven by props, reports through typed events. */
export interface PixiScene<P, E> {
  init(ctx: SceneContext<E>, props: P): void | Promise<void>;
  update(props: P): void;
  resize(width: number, height: number): void;
  destroy(): void;
}

export type SceneFactory<P, E> = () => PixiScene<P, E>;

/** Assets a stage loads on mount and releases on unmount. `src` is relative to the assets root. */
export type StageAsset = { alias: string; src: string };
