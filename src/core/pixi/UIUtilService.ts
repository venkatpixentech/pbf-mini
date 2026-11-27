// UIUtilService: adapted from the legacy framework's corelib/utils/UIUtilService.ts (kept in legacy/corelib), trimmed to what
// objects drawn inside a canvas need: textures, sprites, text (translated, shrunk to a width or line count, per-language size),
// bitmap text, animation frame lists and shapes. Same names and the same config fields as the legacy helpers.
// Not carried, and why:
//  - the element factory (`getElement`): buildView.ts builds elements from typed configs now;
//  - the layout engine (alignHorizontal, scaleElement, doFullScreen, ...): layout.ts replaces it (portrait-only, rewrote its config);
//  - buttons, tabs, toggles, dual images, dynamic sprites, Spine, gif, tween helpers, global registries (textHolder and
//    friends): Phases 1, 2, 4 and 7, or stage-owned teardown;
//  - ContentProxy / Util.getContentV2: text goes through core/i18n `translate`, shared with React; font families are used as
//    written in the config (the legacy FontFaces lookup is gone).
// Changed for Pixi 8: the missing-texture check (an unknown alias is not Texture.EMPTY), getArc and the border helpers
// (the legacy ones used lineStyle/beginFill/endFill and ignored the border width).
import {
  Assets,
  CanvasTextMetrics,
  type Container,
  type FederatedPointerEvent,
  FillGradient,
  type PointData,
  Rectangle,
  type Text,
  Texture,
  TextStyle,
} from 'pixi.js';

import { getLanguage, translate } from 'core/i18n';
import { warnOnce } from 'core/utils/LoggerService';

import {
  type CancelReason,
  limitExpansion,
  MIN_TARGET_CSS,
  PressTracker,
  pointerKind,
  type Rect,
  type SceneInteraction,
  wantedExpansion,
} from './InteractionStep';
import type { InteractionHost } from './scene';
import { type ElementConfig, type InteractionConfig, validateInteractions } from './viewConfig';
import { PixAnimatedSprite } from './wrapper/PixAnimatedSprite';
import { PixBMPText } from './wrapper/PixBMPText';
import { PixGraphics } from './wrapper/PixGraphics';
import { PixSprite } from './wrapper/PixSprite';
import { PixText } from './wrapper/PixText';

/** The text fields the legacy helpers read from a config object. */
export type TextConfigData = {
  /** A translation key, or `contentText` for a literal. */
  content?: string;
  contentText?: string;
  toUpperCase?: boolean;
  style: Record<string, any>;
  /** `{ en: { fontSize: 24 } }`: a different font size per language. */
  fontMLProps?: Record<string, { fontSize: number }>;
  /** Shrink the font until the text is at most this wide. */
  maxWidth?: number;
  /** Shrink the font until the text wraps to at most this many lines. */
  maxLines?: number;
  resolution?: number;
};

/** What bindInteractions returns: add, remove, enable and re-measure interactive objects, and let go of all of them. */
export type InteractionBinding = {
  /** Makes an object tappable under a target name. A target that already exists is replaced (its press is cancelled). */
  add(target: string, object: Container, config?: Partial<InteractionConfig>): void;
  /** Stops a target: its press is cancelled (reason removed) and the object is no longer interactive. */
  remove(target: string): void;
  setEnabled(target: string, enabled: boolean): void;
  /**
   * Ends the press of one pointer with a `cancel`. A scroll view calls it (reason `claimed`) when a drag becomes a scroll, so the same gesture
   * can never also select the object it started on.
   */
  cancelPointer(pointerId: number, reason?: CancelReason): void;
  /** Re-measures every hit area. Call it from the scene's resize(), and after moving or scaling bound objects. */
  refresh(): void;
  /** Removes every handler. Presses in progress are cancelled with reason removed. */
  dispose(): void;
  targets(): string[];
};

type BoundEntry = {
  target: string;
  object: Container;
  config: InteractionConfig;
  enabled: boolean;
  baseAlpha: number;
  hovering: boolean;
  offs: Array<() => void>;
};

// one live binding per root, so binding a root twice can never double the handlers
const bindings = new WeakMap<Container, InteractionBinding>();

class UIUtilService {
  // ---- textures and sprites ----

  /** The texture of an alias or a spritesheet frame. A missing one warns once and returns Texture.EMPTY (nothing drawn). */
  public getTexture(name: string): Texture {
    if (!name) return Texture.EMPTY;
    if (!Assets.cache.has(name)) {
      warnOnce('view', `texture "${name}" is not loaded; add it to the stage assets`);
      return Texture.EMPTY;
    }
    return Texture.from(name);
  }

  public getSprite(name: string, data: any = null): PixSprite {
    const sp = new PixSprite(this.getTexture(name));
    sp.configData = data;
    sp.label = name;
    return sp;
  }

  public getSpriteFromTexture(texture: Texture): PixSprite {
    return new PixSprite(texture);
  }

  // ---- interaction: the legacy names, on Pixi 8 pointer events ----
  // The legacy helpers paired touch and mouse events and used `interactive`/`buttonMode` (no-ops in Pixi 8). Pointer events
  // cover mouse, touch and pen in one, and each add method returns the unsubscribe.

  public setClickable(obj: Container, flag: boolean): void {
    obj.eventMode = flag ? 'static' : 'none';
    obj.cursor = flag ? 'pointer' : 'default';
  }

  public setHandCursor(obj: Container, flag: boolean): void {
    obj.cursor = flag ? 'pointer' : 'default';
  }

  /** Swallows pointer input for everything below (a modal backdrop): the element is hit, its children are not. */
  public setModalState(element: Container): void {
    element.eventMode = 'static';
    element.interactiveChildren = false;
    element.cursor = 'default';
  }

  public removeInteraction(obj: Container): void {
    this.setClickable(obj, false);
  }

  public resumeInteraction(obj: Container): void {
    this.setClickable(obj, true);
  }

  private on(obj: Container, event: string, callback: (e: FederatedPointerEvent) => void, context?: unknown) {
    obj.on(event, callback, context);
    return () => void obj.off(event, callback, context);
  }

  /** Release over the object (the legacy touchend and mouseup). */
  public addInteraction(obj: Container, callback: (e: FederatedPointerEvent) => void, context?: unknown) {
    return this.addUpInteraction(obj, callback, context);
  }

  public addHoverInteraction(obj: Container, callback: (e: FederatedPointerEvent) => void, context?: unknown) {
    return this.on(obj, 'pointerover', callback, context);
  }

  public addUpInteraction(obj: Container, callback: (e: FederatedPointerEvent) => void, context?: unknown) {
    return this.on(obj, 'pointerup', callback, context);
  }

  public addDownInteraction(obj: Container, callback: (e: FederatedPointerEvent) => void, context?: unknown) {
    return this.on(obj, 'pointerdown', callback, context);
  }

  public addOutInteraction(obj: Container, callback: (e: FederatedPointerEvent) => void, context?: unknown) {
    return this.on(obj, 'pointerout', callback, context);
  }

  public addMouseUpOutsideInteraction(obj: Container, callback: (e: FederatedPointerEvent) => void, context?: unknown) {
    return this.on(obj, 'pointerupoutside', callback, context);
  }

  public addMoveInteraction(obj: Container, callback: (e: FederatedPointerEvent) => void, context?: unknown) {
    return this.on(obj, 'globalpointermove', callback, context);
  }

  /**
   * Makes the elements with an `interactive` block tappable and reports what happens as typed events (SceneInteraction) for
   * the scene to pass to React (`ctx.emit`). New in this framework: the legacy code wired handlers by hand.
   *  - Targets are the `interactive.event` names, unique per binding; objects are found by their element `id` label.
   *  - Presses are tracked by pointer id (InteractionStep.PressTracker): a tap is a press and release on the object that moved
   *    at most 10 CSS pixels; touch gives no hover; release outside, pointercancel, disabling, removing and a blocked stage
   *    (paused, hidden tab, lost context) each end a press with exactly one `cancel`. Stage teardown ends them silently.
   *  - Hit areas are the object's bounds plus `hitPadding`, grown to at least `minTarget` CSS pixels, and two close objects
   *    split the gap between them. They are clipped by the canvas itself. Call `refresh()` from the scene's resize().
   *  - A destroyed object drops its binding. Binding a root again disposes the previous binding. The stage disposes the
   *    binding on unmount even if the scene forgets.
   * React stays the owner of the action: a canvas tap is only a second way to do something React also offers as a control.
   */
  public bindInteractions(
    host: InteractionHost,
    root: Container,
    elements: ElementConfig[],
    onEvent: (event: SceneInteraction) => void,
  ): InteractionBinding {
    validateInteractions(elements);
    bindings.get(root)?.dispose();
    const entries = new Map<string, BoundEntry>();
    const tracker = new PressTracker();
    let disposed = false;
    const emit = (event: SceneInteraction) => {
      if (!disposed) onEvent(event);
    };
    const blocked = () => host.input.blocked;
    const live = (en: BoundEntry) => en.enabled && !blocked();
    const cancel = (target: string, reason: CancelReason) => emit({ type: 'cancel', target, reason });

    const apply = (en: BoundEntry) => {
      const isLive = live(en);
      en.object.eventMode = isLive ? 'static' : 'none';
      en.object.cursor = isLive ? (en.config.cursor ?? 'pointer') : 'default';
      en.object.alpha = en.enabled ? en.baseAlpha : (en.config.disabledAlpha ?? 0.5);
      if (!isLive) en.hovering = false;
    };

    const release = (en: BoundEntry, reason: CancelReason, silent = false) => {
      if (tracker.cancelTarget(en.target) && !silent) cancel(en.target, reason);
    };

    const removeEntry = (target: string, silent = false, objectGone = false) => {
      const en = entries.get(target);
      if (!en) return;
      release(en, 'removed', silent);
      entries.delete(target);
      en.offs.splice(0).forEach((off) => off());
      if (!objectGone && !en.object.destroyed) {
        en.object.eventMode = 'auto';
        en.object.cursor = 'default';
        en.object.alpha = en.baseAlpha;
        en.object.hitArea = null;
      }
    };

    const add = (target: string, object: Container, partial: Partial<InteractionConfig> = {}) => {
      if (disposed) throw new Error('This interaction binding is disposed');
      if (!target) throw new Error('An interactive target needs a name');
      if (entries.has(target)) removeEntry(target); // a rebind: the old handlers go first, a press in progress is cancelled
      const config: InteractionConfig = { event: target, ...partial };
      const en: BoundEntry = {
        target,
        object,
        config,
        enabled: !config.disabled,
        baseAlpha: object.alpha,
        hovering: false,
        offs: [],
      };
      const kindOf = (e: FederatedPointerEvent) => pointerKind(e.pointerType);
      const own = (e: FederatedPointerEvent) => tracker.targetOf(e.pointerId) === target;
      en.offs.push(
        this.addDownInteraction(object, (e) => {
          if (!live(en)) return;
          if (tracker.down(e.pointerId, target, e.clientX, e.clientY))
            emit({ type: 'press', target, pointer: kindOf(e) });
        }),
        this.addMoveInteraction(object, (e) => tracker.move(e.pointerId, e.clientX, e.clientY)),
        this.addUpInteraction(object, (e) => {
          if (!own(e)) return; // a press that started on another object and was released here is that object's
          const r = tracker.up(e.pointerId, e.clientX, e.clientY, true);
          if (!r) return;
          emit({ type: 'release', target, pointer: kindOf(e) });
          if (r.tap) {
            const p = root.toLocal(e.global);
            emit({ type: 'tap', target, pointer: kindOf(e), x: p.x, y: p.y });
          }
        }),
        this.addMouseUpOutsideInteraction(object, (e) => {
          if (!own(e)) return;
          if (!tracker.up(e.pointerId, e.clientX, e.clientY, false)) return;
          emit({ type: 'release', target, pointer: kindOf(e) });
          cancel(target, 'outside');
        }),
        this.addHoverInteraction(object, (e) => {
          if (kindOf(e) === 'touch' || !live(en) || en.hovering) return;
          en.hovering = true;
          emit({ type: 'hover', target, pointer: kindOf(e) });
        }),
        this.addOutInteraction(object, (e) => {
          if (!en.hovering) return;
          en.hovering = false;
          emit({ type: 'out', target, pointer: kindOf(e) });
        }),
        this.on(object, 'removed', () => release(en, 'removed')), // taken off the display tree: no press can finish
        this.on(object, 'destroyed', () => removeEntry(target, false, true)),
      );
      entries.set(target, en);
      apply(en);
      refresh();
    };

    /** The object's rectangle in the root's units, or null when it is not on the tree under the root. */
    const rectIn = (object: Container): { rect: Rect; kx: number; ky: number; local: Rect } | null => {
      if (object.destroyed || !object.parent) return null;
      const b = object.getLocalBounds();
      const local: Rect = { x: b.x, y: b.y, width: b.width, height: b.height };
      const a = root.toLocal(object.toGlobal({ x: local.x, y: local.y }));
      const c = root.toLocal(object.toGlobal({ x: local.x + local.width, y: local.y + local.height }));
      const rect: Rect = {
        x: Math.min(a.x, c.x),
        y: Math.min(a.y, c.y),
        width: Math.abs(c.x - a.x),
        height: Math.abs(c.y - a.y),
      };
      return {
        rect,
        local,
        kx: local.width > 0 ? rect.width / local.width : 1,
        ky: local.height > 0 ? rect.height / local.height : 1,
      };
    };

    const refresh = () => {
      const screenScale = Math.hypot(root.worldTransform.a, root.worldTransform.b) || 1; // css px per root unit
      const measured = [...entries.values()].flatMap((en) => {
        const m = rectIn(en.object);
        if (!m) return [];
        const padding = (en.config.hitPadding ?? 0) * ((m.kx + m.ky) / 2);
        const want = wantedExpansion(m.rect, screenScale, padding, en.config.minTarget ?? MIN_TARGET_CSS);
        return [{ en, m, want }];
      });
      const limited = limitExpansion(measured.map(({ en, m, want }) => ({ id: en.target, rect: m.rect, want })));
      for (const { en, m } of measured) {
        const e = limited.get(en.target)!;
        en.object.hitArea = new Rectangle(
          m.local.x - e.left / m.kx,
          m.local.y - e.top / m.ky,
          m.local.width + (e.left + e.right) / m.kx,
          m.local.height + (e.top + e.bottom) / m.ky,
        );
      }
    };

    // Pixi's event system does not turn the DOM `pointercancel` (a touch taken over by the system, for example a scroll or a
    // gesture) into an event on the object, so the binding listens on the canvas itself and cancels that pointer's press.
    const canvas = host.app.canvas;
    const onPointerCancel = (e: PointerEvent) => {
      const target = tracker.cancelPointer(e.pointerId);
      if (target) cancel(target, 'pointercancel');
    };
    canvas.addEventListener('pointercancel', onPointerCancel);

    const unsubscribeBlocked = host.input.onBlockedChange((isBlocked) => {
      if (isBlocked) for (const target of tracker.cancelAll()) cancel(target, 'blocked');
      for (const en of entries.values()) apply(en);
    });

    const binding: InteractionBinding = {
      add,
      remove: (target) => removeEntry(target),
      setEnabled(target, enabled) {
        const en = entries.get(target);
        if (!en) return;
        en.enabled = enabled;
        if (!enabled) release(en, 'disabled');
        apply(en);
      },
      refresh,
      cancelPointer(pointerId, reason = 'claimed') {
        const target = tracker.cancelPointer(pointerId);
        if (target) cancel(target, reason);
      },
      dispose: () => finish(false),
      targets: () => [...entries.keys()],
    };

    // silent: stage teardown, nothing is listening any more, so nothing is emitted
    const finish = (silent: boolean) => {
      if (disposed) return;
      for (const target of [...entries.keys()]) removeEntry(target, silent);
      disposed = true;
      canvas.removeEventListener('pointercancel', onPointerCancel);
      unsubscribeBlocked();
      if (bindings.get(root) === binding) bindings.delete(root);
    };
    host.track(() => finish(true));
    bindings.set(root, binding);

    for (const el of collectInteractive(elements)) {
      const object = root.getChildByLabel(el.id, true);
      if (!object) throw new Error(`bindInteractions: no object labelled "${el.id}" under the root`);
      add(el.interactive.event, object, el.interactive);
    }
    return binding;
  }

  // ---- text ----

  private fontSizeFor(cloneData: TextConfigData) {
    const perLanguage = cloneData.fontMLProps?.[getLanguage()];
    if (perLanguage) cloneData.style.fontSize = perLanguage.fontSize;
  }

  private labelOf(cloneData: TextConfigData) {
    let label = cloneData.contentText ?? (cloneData.content ? translate(cloneData.content) : '');
    if (cloneData.toUpperCase) label = label.toUpperCase();
    return label;
  }

  public getText(obj: TextConfigData): PixText {
    const cloneData: TextConfigData = JSON.parse(JSON.stringify(obj));
    const label = this.labelOf(cloneData);
    this.fontSizeFor(cloneData);
    const style = new TextStyle(cloneData.style);
    const txt = new PixText({ text: label, style, resolution: obj.resolution ?? 1 }, cloneData);
    if (cloneData.maxWidth !== undefined) {
      while (txt.width > cloneData.maxWidth && txt.style.fontSize > 1) txt.style.fontSize -= 1;
    }
    this.applyMaxLines(txt);
    return txt;
  }

  public getBitmapText(obj: TextConfigData): PixBMPText {
    const cloneData: TextConfigData = JSON.parse(JSON.stringify(obj));
    const label = this.labelOf(cloneData);
    this.fontSizeFor(cloneData);
    const style = new TextStyle(cloneData.style);
    return new PixBMPText({ text: label, style }, cloneData);
  }

  /**
   * Fits a text to a width and a line count: it goes back to `baseSize` and then shrinks a pixel at a time until it is at
   * most `maxWidth` wide and wraps to at most `maxLines` lines. Run again after the text changes (a language switch).
   */
  public fitText(txt: Text, fit: { baseSize: number; maxWidth?: number; maxLines?: number }): void {
    txt.style.fontSize = fit.baseSize;
    if (fit.maxWidth !== undefined) {
      while (txt.width > fit.maxWidth && Number(txt.style.fontSize) > 1)
        txt.style.fontSize = Number(txt.style.fontSize) - 1;
    }
    if (fit.maxLines !== undefined) {
      while (
        CanvasTextMetrics.measureText(txt.text, txt.style).lines.length > fit.maxLines &&
        Number(txt.style.fontSize) > 1
      )
        txt.style.fontSize = Number(txt.style.fontSize) - 1;
    }
  }

  /** Shrinks the font (and a line height given in the style) until the text wraps to at most `maxLines` lines. */
  public applyMaxLines(txt: PixText): void {
    const configData = txt.configData as TextConfigData | undefined;
    if (configData?.maxLines === undefined) return;
    const baseFontSize = Number(configData.style?.fontSize);
    const baseLineHeight = Number(configData.style?.lineHeight);
    const scalesLineHeight = Number.isFinite(baseLineHeight) && baseLineHeight > 0;
    if (Number.isFinite(baseFontSize) && baseFontSize > 0) {
      txt.style.fontSize = baseFontSize;
      if (scalesLineHeight) txt.style.lineHeight = baseLineHeight;
    }
    while (
      CanvasTextMetrics.measureText(txt.text, txt.style).lines.length > configData.maxLines &&
      txt.style.fontSize > 1
    ) {
      txt.style.fontSize -= 1;
      if (scalesLineHeight)
        txt.style.lineHeight = Math.max(1, Math.round((baseLineHeight * Number(txt.style.fontSize)) / baseFontSize));
    }
  }

  // ---- animation frames ----

  /**
   * Frame names for a numbered sequence: `prefix` + number (zero padded below `checkPoint`, 10 or 100) + `postfix`, from
   * `start` to `end`, optionally every other frame (`skipFrame`) or backwards (`playReverse`, which stops before `end`).
   */
  public getAnimationFramesArray(obj: any): string[] {
    const arr: string[] = [];
    const checkPoint = obj.checkPoint === undefined ? 10 : obj.checkPoint;
    const toAddZero = obj.toAddZero === undefined ? true : obj.toAddZero;
    const name = (j: number) => {
      let str: string = obj.prefix;
      if (!toAddZero) str += j;
      else if (checkPoint === 100) str += j < 10 ? '00' + j : j < 100 ? '0' + j : j;
      else str += j < checkPoint ? '0' + j : j;
      return str + obj.postfix;
    };
    if (!(obj.start >= 0)) return arr;
    if (obj.playReverse) {
      for (let j = obj.end - 1; j >= obj.start; j--) if (!(obj.skipFrame && j % 2 !== 0)) arr.push(name(j));
    } else {
      for (let j = obj.start; j <= obj.end; j++) if (!(obj.skipFrame && j % 2 !== 0)) arr.push(name(j));
    }
    return arr;
  }

  public getAnimatedSprite(obj: any, configData: any): PixAnimatedSprite {
    const names: string[] = obj.image !== undefined ? [obj.image] : this.getAnimationFramesArray(obj);
    // a frame that is not loaded is left out (the legacy code skipped frames without a texture frame too)
    const frames = names.filter((n) => Assets.cache.has(n)).map((n) => Texture.from(n));
    if (frames.length < names.length)
      warnOnce('view', `animation "${names[0]}": ${names.length - frames.length} frame(s) are not loaded`);
    const movie = new PixAnimatedSprite(frames.length ? frames : [Texture.EMPTY], configData);
    movie.label = names[0];
    movie.anchor.set(0.5, 0.5);
    if (obj.loop !== undefined) movie.loop = obj.loop;
    if (obj.scale !== undefined) movie.scale.set(obj.scale);
    if (obj.animationSpeed) movie.animationSpeed = obj.animationSpeed;
    if (obj.playOnStart) {
      movie.play();
      if (obj.startFrame) movie.gotoAndPlay(obj.startFrame);
    }
    return movie;
  }

  // ---- shapes ----

  public getRectangle(width: number, height: number, color: number, x = 0, y = 0): PixGraphics {
    return new PixGraphics().rect(x, y, width, height).fill(color);
  }

  public getRoundedRectangle(obj: {
    x: number;
    y: number;
    width: number;
    height: number;
    radius: number;
    color: number;
  }) {
    return new PixGraphics().roundRect(obj.x, obj.y, obj.width, obj.height, obj.radius).fill(obj.color);
  }

  /** A linear gradient over `colors` (evenly spaced stops) from `start` to `end` (0..1 of the shape). */
  public getGradientRectangle(obj: {
    width: number;
    height: number;
    colors?: number[];
    start?: PointData;
    end?: PointData;
    radius?: number;
  }): PixGraphics {
    const colors = obj.colors ?? [];
    const gradient = new FillGradient({
      type: 'linear',
      start: obj.start ?? { x: 0, y: 0 },
      end: obj.end ?? { x: 1, y: 0 },
      colorStops: colors.map((color, index) => ({
        offset: colors.length > 1 ? index / (colors.length - 1) : 0,
        color,
      })),
    });
    const g = new PixGraphics();
    if (obj.radius) g.roundRect(0, 0, obj.width, obj.height, obj.radius);
    else g.rect(0, 0, obj.width, obj.height);
    return g.fill(gradient);
  }

  public getCircle(fill: number, radius: number): PixGraphics {
    return new PixGraphics().circle(0, 0, radius).fill(fill);
  }

  /** A pie slice from `startAngle` to `endAngle` (radians) around the centre. Pixi 8 drawing calls. */
  public getArc(centerX: number, centerY: number, radius: number, startAngle: number, endAngle: number, fill: number) {
    return new PixGraphics()
      .moveTo(centerX, centerY)
      .arc(centerX, centerY, radius, startAngle, endAngle)
      .lineTo(centerX, centerY)
      .fill(fill);
  }

  public getPolygon(points: number[] | PointData[], fill: number): PixGraphics {
    return new PixGraphics().poly(points).fill(fill);
  }

  /** A filled rectangle with a border of `borderWidth` (the legacy helper ignored the width). */
  public getBorderRectangle(
    width: number,
    height: number,
    backgroundColor: number,
    borderColor: number,
    borderWidth: number,
    x = 0,
    y = 0,
  ): PixGraphics {
    return new PixGraphics()
      .rect(x, y, width, height)
      .fill(backgroundColor)
      .stroke({ width: borderWidth, color: borderColor });
  }

  public getBorderRoundedRectangle(
    width: number,
    height: number,
    backgroundColor: number,
    borderColor: number,
    borderWidth: number,
    radius = 0,
    fillAlpha = 1,
    strokeAlpha = 1,
  ): PixGraphics {
    return new PixGraphics()
      .roundRect(0, 0, width, height, radius)
      .fill({ color: backgroundColor, alpha: fillAlpha })
      .stroke({ width: borderWidth, color: borderColor, alpha: strokeAlpha });
  }
}

/** The elements (nested groups included) that carry an `interactive` block. */
function collectInteractive(elements: ElementConfig[]): Array<ElementConfig & { interactive: InteractionConfig }> {
  return elements.flatMap((e) => [
    ...(e.interactive ? [e as ElementConfig & { interactive: InteractionConfig }] : []),
    ...(e.type === 'group' ? collectInteractive(e.children) : []),
  ]);
}

export const UIUtil = new UIUtilService();
