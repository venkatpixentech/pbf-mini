// The rules behind canvas interaction: tap versus drag, which press belongs to which pointer, and how big a hit area is.
// Plain TypeScript with no Pixi import, so `Interaction.check.ts` can run it in Node. The wiring to Pixi's pointer events
// is in UIUtilService.ts (bindInteractions).
//
// Units: the movement threshold and the minimum target size are CSS pixels (Pixi's screen coordinates are CSS pixels because
// the stage uses autoDensity, so one CSS pixel is one screen unit). Geometry here is in the scene root's units (design
// pixels for a scene that lays out in a design size); `screenScale` converts them to CSS pixels.

export type PointerKind = 'mouse' | 'touch' | 'pen';
export const pointerKind = (type: string | undefined): PointerKind =>
  type === 'touch' || type === 'pen' ? type : 'mouse';

/** A press that moves further than this many CSS pixels is a drag, not a tap. */
export const TAP_MOVE_CSS = 10;
/** The smallest comfortable touch target, in CSS pixels. */
export const MIN_TARGET_CSS = 44;

export type Rect = { x: number; y: number; width: number; height: number };
/** How far a hit area grows beyond its object on each side. */
export type Expansion = { left: number; top: number; right: number; bottom: number };

export type CancelReason = 'outside' | 'pointercancel' | 'disabled' | 'blocked' | 'removed' | 'claimed';

/**
 * What a scene reports to React about its interactive objects. `x` and `y` of a tap are in the scene root's units (design
 * pixels). Every press ends in exactly one of: `release` then optionally `tap`, or `cancel` with a reason (an outside release
 * emits `release` and then `cancel`). Stage teardown ends presses silently.
 */
export type SceneInteraction =
  | { type: 'tap'; target: string; pointer: PointerKind; x: number; y: number }
  | { type: 'press' | 'release' | 'hover' | 'out'; target: string; pointer: PointerKind }
  | { type: 'cancel'; target: string; reason: CancelReason };

type Press = { pointerId: number; target: string; startX: number; startY: number; moved: boolean };

/**
 * Presses in progress, by pointer id. One press per target (the first pointer wins; a second pointer on a pressed target is
 * ignored); presses on different targets, with different pointers, are independent. Every method returns what happened so
 * the caller emits exactly one event per outcome.
 */
export class PressTracker {
  private byPointer = new Map<number, Press>();
  private byTarget = new Map<string, number>();

  /** Starts a press. False when the target is already pressed (or this pointer is already pressing something). */
  down(pointerId: number, target: string, x: number, y: number): boolean {
    if (this.byTarget.has(target) || this.byPointer.has(pointerId)) return false;
    this.byPointer.set(pointerId, { pointerId, target, startX: x, startY: y, moved: false });
    this.byTarget.set(target, pointerId);
    return true;
  }

  /** Records a pointer move (CSS pixels); once it passes the threshold the press can no longer be a tap. */
  move(pointerId: number, x: number, y: number, threshold = TAP_MOVE_CSS): void {
    const p = this.byPointer.get(pointerId);
    if (p && !p.moved && Math.hypot(x - p.startX, y - p.startY) > threshold) p.moved = true;
  }

  /** Ends a press by release. `inside` is whether the pointer was released over the target. Null when there was no press. */
  up(pointerId: number, x: number, y: number, inside: boolean, threshold = TAP_MOVE_CSS) {
    const p = this.byPointer.get(pointerId);
    if (!p) return null;
    this.move(pointerId, x, y, threshold);
    this.remove(p);
    return { target: p.target, tap: inside && !p.moved, outside: !inside };
  }

  /** Aborts the press of one pointer. Returns its target, or null when there was none. */
  cancelPointer(pointerId: number): string | null {
    const p = this.byPointer.get(pointerId);
    if (!p) return null;
    this.remove(p);
    return p.target;
  }

  /** Aborts the press on a target (disabled, removed, rebound). Returns true when there was one. */
  cancelTarget(target: string): boolean {
    const id = this.byTarget.get(target);
    if (id === undefined) return false;
    this.cancelPointer(id);
    return true;
  }

  /** Aborts every press (the stage was blocked). Returns the targets that were pressed. */
  cancelAll(): string[] {
    const targets = [...this.byTarget.keys()];
    this.byPointer.clear();
    this.byTarget.clear();
    return targets;
  }

  /** The target this pointer is pressing, if any. */
  targetOf(pointerId: number): string | undefined {
    return this.byPointer.get(pointerId)?.target;
  }

  isPressed(target: string): boolean {
    return this.byTarget.has(target);
  }

  get size(): number {
    return this.byPointer.size;
  }

  private remove(p: Press) {
    this.byPointer.delete(p.pointerId);
    this.byTarget.delete(p.target);
  }
}

/**
 * How far to grow an object's hit area, per side, in root units: `padding` on every side, then more so the area is at least
 * `minTarget` CSS pixels on each axis. `screenScale` is CSS pixels per root unit.
 */
export function wantedExpansion(
  size: { width: number; height: number },
  screenScale: number,
  padding: number,
  minTarget: number,
): Expansion {
  const scale = Number.isFinite(screenScale) && screenScale > 0 ? screenScale : 1;
  const p = Math.max(0, padding || 0);
  const axis = (extent: number) => {
    const withPadding = Math.max(0, extent) + 2 * p;
    const missing = Math.max(0, minTarget / scale - withPadding);
    return p + missing / 2;
  };
  const x = axis(size.width);
  const y = axis(size.height);
  return { left: x, right: x, top: y, bottom: y };
}

/**
 * Limits each hit area's growth so it never reaches past the midpoint of the gap to another object's own rectangle: two close
 * objects split the space between them, so which one a tap belongs to does not depend on drawing order. Objects whose own
 * rectangles overlap are not limited by each other (the topmost one wins, as in Pixi). Returns the limited expansion by id.
 */
export function limitExpansion(items: Array<{ id: string; rect: Rect; want: Expansion }>): Map<string, Expansion> {
  const out = new Map<string, Expansion>();
  for (const a of items) {
    const e = { ...a.want };
    for (const b of items) {
      if (b === a) continue;
      const aTop = a.rect.y - a.want.top;
      const aBottom = a.rect.y + a.rect.height + a.want.bottom;
      const aLeft = a.rect.x - a.want.left;
      const aRight = a.rect.x + a.rect.width + a.want.right;
      const sharesRows = b.rect.y < aBottom && b.rect.y + b.rect.height > aTop;
      const sharesColumns = b.rect.x < aRight && b.rect.x + b.rect.width > aLeft;
      if (sharesRows) {
        const gapRight = b.rect.x - (a.rect.x + a.rect.width);
        if (gapRight >= 0) e.right = Math.min(e.right, gapRight / 2);
        const gapLeft = a.rect.x - (b.rect.x + b.rect.width);
        if (gapLeft >= 0) e.left = Math.min(e.left, gapLeft / 2);
      }
      if (sharesColumns) {
        const gapBelow = b.rect.y - (a.rect.y + a.rect.height);
        if (gapBelow >= 0) e.bottom = Math.min(e.bottom, gapBelow / 2);
        const gapAbove = a.rect.y - (b.rect.y + b.rect.height);
        if (gapAbove >= 0) e.top = Math.min(e.top, gapAbove / 2);
      }
    }
    out.set(a.id, e);
  }
  return out;
}
