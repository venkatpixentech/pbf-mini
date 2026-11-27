import type { Application, Container } from 'pixi.js';

/**
 * Whether the stage is taking input. It is blocked while the stage is paused, the tab is hidden or the WebGL context is
 * lost: the same three reasons the stage stops its ticker. Interaction bindings cancel presses in progress when it blocks.
 */
export type StageInput = {
  readonly blocked: boolean;
  /** Called when `blocked` changes; returns the unsubscribe. */
  onBlockedChange(listener: (blocked: boolean) => void): () => void;
};

/** Everything a scene may use. Scenes never import React, stores, services or Apollo. */
export interface SceneContext<E> {
  app: Application;
  root: Container;
  /** Report to React. The only way out of a scene. */
  emit(event: E): void;
  /** Register a cleanup (listener, tween, timer). PixiStage runs all of them on unmount. */
  track(dispose: () => void): void;
  /** Pause, hidden tab and context loss as one flag, for anything that takes pointer input. */
  input: StageInput;
}

/** The part of the context that helpers (tweens, effects) need: any scene's context fits, whatever its events. */
export type StageHost = Pick<SceneContext<never>, 'app' | 'root' | 'track'>;

/** What interaction bindings need: a StageHost plus the stage's input state. */
export type InteractionHost = Pick<SceneContext<never>, 'app' | 'root' | 'track' | 'input'>;

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
