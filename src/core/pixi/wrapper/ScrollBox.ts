// ScrollBox: adapted from the legacy framework's corelib/pixiwrapper/ScrollBox.ts (kept in legacy/corelib). Same options, methods (addItems, removeItems, scrollTo, scrollToPosition, scrollTop, scrollBottom, isItemVisible, resize) and signals (onScroll, onProximityChange). Changes: `typed-signals` is replaced by a local Signal (no dependency); it can be driven by the stage's ticker (`options.ticker`), so a paused stage stops momentum; strict-mode typing. Use it for a strip or list drawn inside a scene; page scrolling and page lists stay React.
import {
  ColorSource,
  Container,
  DestroyOptions,
  EventMode,
  FederatedPointerEvent,
  Graphics,
  isMobile,
  Optional,
  Point,
  PointData,
  Size,
  Ticker,
} from 'pixi.js';
import { Signal } from './trackpad/Signal';
import { List } from './List';
import { Trackpad } from './trackpad/Trackpad';

import type { ListOptions, ListType } from './List';

export type ScrollBoxOptions = {
  width: number;
  height: number;
  background?: ColorSource;
  type?: ListType;
  radius?: number;
  disableDynamicRendering?: boolean;
  disableEasing?: boolean;
  dragTrashHold?: number;
  globalScroll?: boolean;
  shiftScroll?: boolean;
  proximityRange?: number;
  proximityDebounce?: number;
  disableProximityCheck?: boolean;
  showScrollbar?: boolean;
  scrollbarWidth?: number;
  scrollbarBackground?: ColorSource;
  scrollbarFill?: ColorSource;
  /** The ticker that drives scrolling and momentum: the stage's own (`ctx.app.ticker`), so a paused stage stops it. Default: the shared ticker. */
  ticker?: Ticker;
  /** True while the stage takes no input (paused, hidden, context lost): wheel and drags are ignored. Pass `() => ctx.input.blocked`. */
  isBlocked?: () => boolean;
} & Omit<ListOptions, 'children'>;

type ProximityEventData = {
  item: Container;
  index: number;
  inRange: boolean;
};

/**
 * Scrollable view, for arranging lists of Pixi container-based elements.
 *
 * Items, that are out of the visible area, are not rendered by default.
 * This behavior can be changed by setting 'disableDynamicRendering' option to true.
 * @example
 * new ScrollBox({
 *     background: 0XFFFFFF,
 *     width: 200,
 *     height: 300,
 *     items: [
 *         new Graphics().drawRect(0, 0, 200, 50).fill(0x000000),
 *         new Graphics().drawRect(0, 0, 200, 50).fill(0x000000),
 *         new Graphics().drawRect(0, 0, 200, 50).fill(0x000000),
 *         new Graphics().drawRect(0, 0, 200, 50).fill(0x000000),
 *         new Graphics().drawRect(0, 0, 200, 50).fill(0x000000),
 *         new Graphics().drawRect(0, 0, 200, 50).fill(0x000000),
 *         new Graphics().drawRect(0, 0, 200, 50).fill(0x000000),
 *     ],
 * });
 */

export class ScrollBox extends Container {
  protected background!: Graphics;
  protected borderMask!: Graphics;
  protected lastWidth!: number;
  protected lastHeight!: number;
  protected __width = 0;
  protected __height = 0;
  protected _dimensionChanged = false;

  protected list!: List;

  protected _trackpad!: Trackpad;
  protected isDragging = 0;
  protected interactiveStorage: {
    item: Container;
    eventMode: EventMode;
  }[] = [];
  protected visibleItems: Container[] = [];
  protected pressedChild: Container | null = null;
  protected ticker: Ticker = Ticker.shared;
  protected options!: ScrollBoxOptions;
  protected stopRenderHiddenItemsTimeout: ReturnType<typeof setTimeout> | null = null;
  protected onMouseScrollBinding = this.onMouseScroll.bind(this);
  protected dragStarTouchPoint!: Point;
  protected isOver = false;

  protected proximityRange!: number;
  protected proximityStatusCache: boolean[] = [];
  protected lastScrollX!: number | null;
  public lastScrollY!: number | null;
  protected proximityCheckFrameCounter = 0;
  public onProximityChange = new Signal<(data: ProximityEventData) => void>();
  public onScroll: Signal<(value: number) => void> = new Signal();
  /**
   * Fires with the pointer id when a press becomes a scroll: the drag passed `dragTrashHold` (default 10 CSS px, the same threshold as a tap),
   * or the press landed on a strip that was still coasting. An interaction binding cancels that press (`cancelPointer(id, 'claimed')`), so a
   * scroll can never also select an item. It replaces the legacy synthetic `pointerupoutside` events with a null event.
   */
  public onDragClaim: Signal<(pointerId: number) => void> = new Signal();
  protected dragEndTouchPoint!: Point;
  protected disableScroll: boolean = false;
  protected scrollbarTrack!: Graphics;
  protected scrollbarThumb!: Graphics;
  protected showScrollbar: boolean = false;

  // --- Added for drag/click suppression ---
  public suppressClick = false;
  public lastDragTime = 0;
  // ----------------------------------------

  /**
   * @param options
   * @param {number} options.background - background color of the ScrollBox.
   * @param {number} options.width - width of the ScrollBox.
   * @param {number} options.height - height of the ScrollBox.
   * @param {number} options.radius - radius of the ScrollBox and its masks corners.
   * @param {number} options.elementsMargin - margin between elements.
   * @param {number} options.vertPadding - vertical padding of the ScrollBox.
   * @param {number} options.horPadding - horizontal padding of the ScrollBox.
   * @param {number} options.padding - padding of the ScrollBox (same horizontal and vertical).
   * @param {boolean} options.disableDynamicRendering - disables dynamic rendering of the ScrollBox,
   * so even elements the are not visible will be rendered. Be careful with this options as it can impact performance.
   * @param {boolean} [options.globalScroll=true] - if true, the ScrollBox will scroll even if the mouse is not over it.
   * @param {boolean} [options.shiftScroll=false] - if true, the ScrollBox will only scroll horizontally if the shift key
   * is pressed, and the type is set to 'horizontal'.
   */
  constructor(options?: ScrollBoxOptions) {
    super();
    if (options?.ticker) this.ticker = options.ticker;

    if (options) {
      this.init(options);
    }

    this.ticker.add(this.update, this);
  }

  /**
   * Initiates ScrollBox.
   * @param options
   * @param {number} options.background - background color of the ScrollBox.
   * @param {number} options.width - width of the ScrollBox.
   * @param {number} options.height - height of the ScrollBox.
   * @param {number} options.radius - radius of the ScrollBox and its masks corners.
   * @param {number} options.elementsMargin - margin between elements.
   * @param {number} options.vertPadding - vertical padding of the ScrollBox.
   * @param {number} options.horPadding - horizontal padding of the ScrollBox.
   * @param {number} options.padding - padding of the ScrollBox (same horizontal and vertical).
   * @param {boolean} options.disableDynamicRendering - disables dynamic rendering of the ScrollBox,
   * so even elements the are not visible will be rendered. Be careful with this options as it can impact performance.
   * @param {boolean} [options.globalScroll=true] - if true, the ScrollBox will scroll even if the mouse is not over it.
   * @param {boolean} [options.shiftScroll=false] - if true, the ScrollBox will only scroll horizontally if the shift key
   */
  init(options: ScrollBoxOptions) {
    this.options = options;
    this.showScrollbar = options.showScrollbar ?? false;
    this.setBackground(options.background);

    this.__width = options.width | this.background.width;
    this.__height = options.height | this.background.height;

    this.proximityRange = options.proximityRange ?? 0;

    if (!this.list) {
      this.list = new List();

      super.addChild(this.list);
    }

    this.list.init({
      type: options.type,
      elementsMargin: options.elementsMargin,
      padding: options.padding,
      vertPadding: options.vertPadding,
      horPadding: options.horPadding,
      topPadding: options.topPadding,
      bottomPadding: options.bottomPadding,
      leftPadding: options.leftPadding,
      rightPadding: options.rightPadding,
    });

    if (options.items) this.addItems(options.items);

    if (this.hasBounds) {
      this.addMask();
      this.makeScrollable();
      if (this.showScrollbar) {
        this.createScrollbar(options);
      }
    }

    this._trackpad.xAxis.value = 0;
    this._trackpad.yAxis.value = 0;

    this.options.globalScroll = options.globalScroll ?? true;
    this.options.shiftScroll = options.shiftScroll ?? false;
    this.resize();
  }

  protected createScrollbar(options: ScrollBoxOptions) {
    if (this.scrollbarTrack) {
      this.removeChild(this.scrollbarTrack);
      this.scrollbarTrack.destroy();
    }
    if (this.scrollbarThumb) {
      this.removeChild(this.scrollbarThumb);
      this.scrollbarThumb.destroy();
    }

    const isVertical = options.type !== 'horizontal';
    const scrollbarWidth = options.scrollbarWidth ?? 6;
    const bgColor = options.scrollbarBackground ?? 0x555555;
    const fillColor = options.scrollbarFill ?? 0x999999;

    // Create scrollbar track background
    this.scrollbarTrack = new Graphics();
    if (isVertical) {
      this.scrollbarTrack.rect(this.__width - scrollbarWidth, 0, scrollbarWidth, this.__height);
    } else {
      this.scrollbarTrack.rect(0, this.__height - scrollbarWidth, this.__width, scrollbarWidth);
    }
    this.scrollbarTrack.fill(bgColor);
    this.addChild(this.scrollbarTrack);

    // Create scrollbar thumb (the draggable part)
    this.scrollbarThumb = new Graphics();
    this.scrollbarThumb.rect(0, 0, isVertical ? scrollbarWidth : 40, isVertical ? 40 : scrollbarWidth);
    this.scrollbarThumb.fill(fillColor);

    if (isVertical) {
      this.scrollbarThumb.x = this.__width - scrollbarWidth;
      this.scrollbarThumb.y = 0;
    } else {
      this.scrollbarThumb.x = 0;
      this.scrollbarThumb.y = this.__height - scrollbarWidth;
    }

    this.addChild(this.scrollbarThumb);
  }

  protected updateScrollbar() {
    if (!this.showScrollbar || !this.scrollbarThumb) return;

    const isVertical = this.options.type !== 'horizontal';
    const scrollbarWidth = this.scrollbarTrack.width > this.scrollbarTrack.height ? 6 : 6;
    const listSize = isVertical ? this.listHeight : this.listWidth;
    const boxSize = isVertical ? this.__height : this.__width;

    if (listSize <= boxSize) {
      // No scrolling needed, hide both track and thumb
      this.scrollbarThumb.visible = false;
      this.scrollbarTrack.visible = false;
      return;
    }

    // Content is scrollable, show both
    this.scrollbarThumb.visible = true;
    this.scrollbarTrack.visible = true;
    this.scrollbarThumb.alpha = 1;

    const scrollRatio = (boxSize - this.scrollbarThumb.height) / (listSize - boxSize);
    const scrollValue = isVertical ? this.scrollY : this.scrollX;

    if (isVertical) {
      this.scrollbarThumb.y = Math.abs(scrollValue) * scrollRatio;
    } else {
      this.scrollbarThumb.x = Math.abs(scrollValue) * scrollRatio;
    }
  }

  protected get hasBounds(): boolean {
    return !!this.__width || !!this.__height;
  }

  /**
   *  Adds array of items to a scrollable list.
   * @param {Container[]} items - items to add.
   */
  addItems(items: Container[]) {
    if (!items?.length) return;

    items.forEach((item) => this.addItem(item));
  }

  /** Remove all items from a scrollable list. */
  removeItems() {
    this.proximityStatusCache.length = 0;
    this.list.removeChildren();
  }

  checkPointerTouch(): boolean {
    // Only true if trackpad exists, pointerTouch is true, and a drag is in progress
    return !!(this._trackpad && this._trackpad.pointerTouch && this.isDragging);
  }

  checkTouchInteraction(): boolean {
    // Only true if trackpad exists, touchInteraction is true, and a drag is in progress
    return !!(this._trackpad && this._trackpad.touchInteraction && this.isDragging);
  }

  /**
   * Adds one or more items to a scrollable list.
   * @param {Container} items - one or more items to add.
   */
  addItem<T extends Container[]>(...items: T): T[0] {
    if (items.length > 1) {
      items.forEach((item) => this.addItem(item));
    } else {
      const child = items[0];

      if (!child.width || !child.height) {
        console.error('ScrollBox item should have size');
      }

      child.eventMode = 'static';

      this.list.addChild(child);
      this.proximityStatusCache.push(false);

      if (!this.options.disableDynamicRendering) {
        child.renderable = this.isItemVisible(child);
      }

      // --- Attach pointertap handler to suppress click after drag ---
      child.on('pointertap', (e) => {
        // Suppress click if a drag just happened (within 300ms)
        if (this.suppressClick || Date.now() - this.lastDragTime < 300) {
          e.stopPropagation?.();
          return;
        }
      });
      // -------------------------------------------------------------
    }

    this.resize();

    return items[0];
  }

  /**
   * Removes an item from a scrollable list.
   * @param {number} itemID - id of the item to remove.
   */
  removeItem(itemID: number) {
    this.list.removeItem(itemID);
    this.proximityStatusCache.splice(itemID, 1);
    this.resize();
  }

  /**
   * Checks if the item is visible or scrolled out of the visible part of the view.* Adds an item to a scrollable list.
   * @param {Container} item - item to check.
   * @param padding - proximity padding to consider the item visible.
   */
  isItemVisible(item: Container, padding = 0): boolean {
    const isVertical = this.options.type === 'vertical' || !this.options.type;
    let isVisible = false;
    const list = this.list;

    if (isVertical) {
      const posY = item.y + list.y;

      if (posY + item.height >= -padding && posY <= this.options.height + padding) {
        isVisible = true;
      }
    } else {
      const posX = item.x + list.x;

      if (posX + item.width >= -padding && posX <= this.options.width + padding) {
        isVisible = true;
      }
    }

    return isVisible;
  }

  /**
   * Returns all inner items in a list.
   * @returns {Array<Container> | Array} - list of items.
   */
  get items(): Container[] {
    return this.list?.children ?? [];
  }

  /**
   * Set ScrollBox background.
   * @param {number | string} background - background color or texture.
   */
  setBackground(background?: ColorSource) {
    if (this.background) {
      this.removeChild(this.background);
    }

    this.options.background = background;

    this.background = new Graphics();

    this.addChildAt(this.background, 0);

    this.resize();
  }

  protected addMask() {
    if (!this.borderMask) {
      this.borderMask = new Graphics();
      super.addChild(this.borderMask);
      this.mask = this.borderMask;
    }

    this.resize();
  }

  protected makeScrollable() {
    if (!this._trackpad) {
      this._trackpad = new Trackpad({
        disableEasing: this.options.disableEasing,
      });
    }

    let dragHappened = false;

    this.on('pointerdown', (e: FederatedPointerEvent) => {
      if (this.options.isBlocked?.()) return;
      // Prevent native touch event from propagating to parent iframe/sheet
      (e.nativeEvent as Event)?.preventDefault?.();
      (e.nativeEvent as Event)?.stopPropagation?.();

      this.renderAllItems();

      const coasting = this.isMoving;
      this.isDragging = 1;
      dragHappened = false;
      this.suppressClick = false;
      this.dragStarTouchPoint = this.worldTransform.applyInverse(e.global);

      this._trackpad.pointerDown(this.dragStarTouchPoint);
      if (coasting) this.onDragClaim.emit(e.pointerId); // a press that catches a moving strip stops it and is not a selection

      const listTouchPoint = this.list.worldTransform.applyInverse(e.global);

      this.visibleItems.forEach((item) => {
        if (
          item.x < listTouchPoint?.x &&
          item.x + item.width > listTouchPoint?.x &&
          item.y < listTouchPoint?.y &&
          item.y + item.height > listTouchPoint?.y
        ) {
          this.pressedChild = item;
        }
      });
    });

    this.on('pointerover', () => {
      if (this.disableScroll) return;
      this.isOver = true;
    });

    this.on('pointerout', () => {
      if (this.disableScroll) return;
      this.isOver = false;
    });

    this.on('pointerupoutside', () => {
      if (this.disableScroll) return;
      this.isDragging = 0;
      this._trackpad.pointerUp(this.dragEndTouchPoint);
      this.restoreItemsInteractivity();

      this.pressedChild = null;

      this.stopRenderHiddenItems();
    });

    this.on('globalpointermove', (e: FederatedPointerEvent) => {
      if (this.disableScroll) return;
      if (!this.isDragging) return;

      // Prevent native touch event from propagating to parent iframe/sheet
      (e.nativeEvent as Event)?.preventDefault?.();
      (e.nativeEvent as Event)?.stopPropagation?.();

      const isVertical: boolean = this.options.type !== 'horizontal';
      const touchPoint = this.worldTransform.applyInverse(e.global);

      if (this.dragStarTouchPoint) {
        const dragTrashHold = this.options.dragTrashHold ?? 10;

        if (this.options.type === 'horizontal') {
          const xDist = touchPoint.x - this.dragStarTouchPoint.x;

          if (Math.abs(xDist) > dragTrashHold) {
            if (this.isDragging !== 2) this.onDragClaim.emit(e.pointerId);
            this.isDragging = 2;
            dragHappened = true;
            this.suppressClick = true;
          }
        } else {
          const yDist = touchPoint.y - this.dragStarTouchPoint.y;

          if (Math.abs(yDist) > dragTrashHold) {
            if (this.isDragging !== 2) this.onDragClaim.emit(e.pointerId);
            this.isDragging = 2;
            dragHappened = true;
            this.suppressClick = true;
          }
        }
      }

      if (this.dragStarTouchPoint && this.isDragging !== 2) return;

      this._trackpad.pointerMove(touchPoint);

      if (this.pressedChild) {
        this.revertClick(this.pressedChild);
        this.pressedChild = null;
      }

      this.onScroll?.emit(isVertical ? this.scrollY : this.scrollX);
    });

    this.on('pointerup', (e: FederatedPointerEvent) => {
      this.isDragging = 0;
      this.dragEndTouchPoint = this.worldTransform.applyInverse(e.global);
      this._trackpad.pointerUp(this.dragEndTouchPoint);
      this.restoreItemsInteractivity();

      // If a drag happened, prevent click event on the item
      if (dragHappened) {
        this.lastDragTime = Date.now();
        this.suppressClick = true;
      }

      this.pressedChild = null;

      // Reset suppressClick after a short delay to allow pointertap to be suppressed
      setTimeout(() => {
        this.suppressClick = false;
      }, 200);

      this.stopRenderHiddenItems();
    });

    document.addEventListener('wheel', this.onMouseScrollBinding, true);
  }

  protected setInteractive(interactive: boolean) {
    this.eventMode = 'static';
    if (!interactive) {
      this.disableScroll = true;
    } else {
      this.disableScroll = false;
    }
  }

  protected get listHeight(): number {
    return this.list.height + this.list.topPadding + this.list.bottomPadding;
  }

  protected get listWidth(): number {
    return this.list.width + this.list.leftPadding + this.list.rightPadding;
  }

  /**
   * Controls item positions and visibility.
   * @param force
   */
  resize(force = false): void {
    if (!this.hasBounds) return;

    this.renderAllItems();

    if (
      this.borderMask &&
      (force || this._dimensionChanged || this.lastWidth !== this.listWidth || this.lastHeight !== this.listHeight)
    ) {
      if (!this.options.width) {
        this.__width += this.listWidth;
      }

      if (!this.options.height) {
        this.__height += this.listHeight;
      }

      this.borderMask
        .clear()
        .roundRect(0, 0, this.__width, this.__height, (this.options.radius ?? 0) | 0)
        .fill(0xff00ff)
        .stroke(0x0);
      this.borderMask.eventMode = 'none';

      const color = this.options.background;

      this.background
        .clear()
        .roundRect(0, 0, this.__width, this.__height, (this.options.radius ?? 0) | 0)
        .fill({
          color: color ?? 0x000000,
          alpha: color ? 1 : 0.0000001, // if color is not set, set alpha to 0 to be able to drag by click on bg
        });

      if (this.options.type === 'horizontal') {
        this.setInteractive(this.listWidth > this.__width);
      } else {
        this.setInteractive(this.listHeight > this.__height);
      }

      this.lastWidth = this.listWidth;
      this.lastHeight = this.listHeight;
    }

    if (this._trackpad) {
      const maxWidth = this.borderMask.width - this.list.width - this.list.leftPadding - this.list.rightPadding;

      const maxHeight = this.borderMask.height - this.list.height - this.list.topPadding - this.list.bottomPadding;

      if (this.options.type === 'vertical') {
        this._trackpad.yAxis.max = -Math.abs(maxHeight);
      } else if (this.options.type === 'horizontal') {
        this._trackpad.xAxis.max = -Math.abs(maxWidth);
      } else {
        this._trackpad.yAxis.max = -Math.abs(maxHeight);
        this._trackpad.xAxis.max = -Math.abs(maxWidth);
      }
    }

    if (this._dimensionChanged) {
      this.list.arrangeChildren();

      // Since the scrolling adjustment can happen due to the resize,
      // we shouldn't update the visible items immediately.
      this.stopRenderHiddenItems();

      this._dimensionChanged = false;
    } else this.updateVisibleItems();

    this.lastScrollX = null;
    this.lastScrollY = null;
    this.updateScrollbar();
  }

  protected onMouseScroll(event: WheelEvent): void {
    if (this.options.isBlocked?.()) return;
    if (!this.isOver && !this.options.globalScroll) return;

    this.renderAllItems();

    const scrollOnX = this.options.shiftScroll
      ? typeof event.deltaX !== 'undefined' || typeof event.deltaY !== 'undefined'
      : typeof event.deltaX !== 'undefined';

    if (this.options.type === 'horizontal' && scrollOnX) {
      const delta = this.options.shiftScroll ? event.deltaX : event.deltaY;
      const targetPos = this.list.x - delta;

      if (this.listWidth < this.__width) {
        this._trackpad.xAxis.value = 0;
      } else {
        const min = this.__width - this.listWidth;
        const max = 0;

        this._trackpad.xAxis.value = Math.min(max, Math.max(min, targetPos));
      }

      this.onScroll?.emit(this._trackpad.xAxis.value);
    } else if (typeof event.deltaY !== 'undefined') {
      const targetPos = this.list.y - event.deltaY;

      if (this.listHeight < this.__height) {
        this._trackpad.yAxis.value = 0;
      } else {
        const min = this.__height - this.listHeight;
        const max = 0;

        this._trackpad.yAxis.value = Math.min(max, Math.max(min, targetPos));
      }

      this.onScroll?.emit(this._trackpad.yAxis.value);
    }

    this.stopRenderHiddenItems();
  }

  /** Makes it scroll down to the last element. */
  scrollBottom() {
    if (!this.interactive) {
      this.scrollTop();
    } else {
      this.scrollTo(this.list.children.length - 1);
    }
  }

  /** Makes it scroll up to the first element. */
  scrollTop() {
    this.renderAllItems();

    this._trackpad.xAxis.value = 0;
    this._trackpad.yAxis.value = 0;

    this.stopRenderHiddenItems();
  }

  protected renderAllItems() {
    clearTimeout(this.stopRenderHiddenItemsTimeout ?? undefined);
    this.stopRenderHiddenItemsTimeout = null;

    if (this.options.disableDynamicRendering) {
      return;
    }

    this.items.forEach((child) => {
      child.renderable = true;
    });
  }

  protected stopRenderHiddenItems() {
    if (this.options.disableDynamicRendering) {
      return;
    }

    if (this.stopRenderHiddenItemsTimeout) {
      clearTimeout(this.stopRenderHiddenItemsTimeout ?? undefined);
      this.stopRenderHiddenItemsTimeout = null;
    }

    this.stopRenderHiddenItemsTimeout = setTimeout(() => this.updateVisibleItems(), 2000);
  }

  protected updateVisibleItems() {
    this.visibleItems.length = 0;

    this.items.forEach((child) => {
      child.renderable = this.isItemVisible(child);
      this.visibleItems.push(child);
    });
  }

  /**
   * Scrolls to the element with the given ID.
   * @param elementID
   */
  scrollTo(elementID: number) {
    if (!this.interactive) {
      return;
    }

    const target = this.list.children[elementID];

    if (!target) {
      return;
    }

    this.renderAllItems();

    this._trackpad.xAxis.value =
      this.options.type === 'horizontal' ? this.__width - target.x - target.width - this.list.rightPadding : 0;

    this._trackpad.yAxis.value =
      !this.options.type || this.options.type === 'vertical'
        ? this.__height - target.y - target.height - this.list.bottomPadding
        : 0;

    this.stopRenderHiddenItems();
  }

  /**
   * Scrolls to the given position.
   * @param position - x and y position object.
   * @param position.x - x position.
   * @param position.y - y position.
   */
  scrollToPosition({ x, y }: Partial<PointData>) {
    if (x === undefined && y === undefined) return;
    this.renderAllItems();
    if (x !== undefined) this.scrollX = -x;
    if (y !== undefined) this.scrollY = -y;
    this.stopRenderHiddenItems();
  }

  /** Gets component height. */
  override get height(): number {
    return this.__height;
  }

  override set height(value: number) {
    this.__height = value;
    this._dimensionChanged = true;
    this.resize();
    this.scrollTop();
  }

  /** Gets component width. */
  override get width(): number {
    return this.__width;
  }

  override set width(value: number) {
    this.__width = value;
    this._dimensionChanged = true;
    this.resize();
    this.scrollTop();
  }

  override setSize(value: number | Optional<Size, 'height'>, height?: number): void {
    if (typeof value === 'object') {
      height = value.height ?? value.width;
      value = value.width;
    } else {
      height = height ?? value;
    }

    this.__width = value;
    this.__height = height;
    this._dimensionChanged = true;
    this.resize();
    this.scrollTop();
  }

  override getSize(out?: Size): Size {
    out = out || { width: 0, height: 0 };
    out.width = this.__width;
    out.height = this.__height;

    return out;
  }

  /** Gets the current raw scroll position on the x-axis (Negated Value). */
  get scrollX(): number {
    return this._trackpad.xAxis.value;
  }

  /** Sets the current raw scroll position on the x-axis (Negated Value). */
  set scrollX(value: number) {
    this._trackpad.xAxis.value = value;
  }

  /** Gets the current raw scroll position on the y-axis (Negated Value). */
  get scrollY(): number {
    return this._trackpad.yAxis.value;
  }

  /** Sets the current raw scroll position on the y-axis (Negated Value). */
  set scrollY(value: number) {
    this._trackpad.yAxis.value = value;
  }

  protected update() {
    if (!this.list) return;

    this._trackpad.update();

    const type = this.options.type === 'horizontal' ? 'x' : 'y';

    if (this.list[type] !== this._trackpad[type]) {
      this.list[type] = this._trackpad[type];
      this.updateScrollbar();
    }

    if (
      !this.options.disableProximityCheck &&
      (this._trackpad.x !== this.lastScrollX || this._trackpad.y !== this.lastScrollY)
    ) {
      this.proximityCheckFrameCounter++;
      if (this.proximityCheckFrameCounter >= (this.options.proximityDebounce ?? 10)) {
        this.items.forEach((item, index) => {
          const inRange = this.isItemVisible(item, this.proximityRange);
          const wasInRange = this.proximityStatusCache[index];

          if (inRange !== wasInRange) {
            this.proximityStatusCache[index] = inRange;
            this.onProximityChange.emit({ item, index, inRange });
          }
        });
        this.lastScrollX = this._trackpad.x;
        this.lastScrollY = this._trackpad.y;
        this.proximityCheckFrameCounter = 0;
      }
    }
  }

  /**
   * Destroys the component.
   * @param {boolean | DestroyOptions} [options] - Options parameter.
   * A boolean will act as if all options have been set to that value
   */
  override destroy(options?: DestroyOptions | boolean) {
    this.ticker.remove(this.update, this);
    this.onScroll.disconnectAll();
    this.onProximityChange.disconnectAll();
    this.onDragClaim.disconnectAll();

    document.removeEventListener('wheel', this.onMouseScrollBinding, true);
    clearTimeout(this.stopRenderHiddenItemsTimeout ?? undefined);
    this.stopRenderHiddenItemsTimeout = null;

    if (this.scrollbarTrack) {
      this.scrollbarTrack.destroy();
    }
    if (this.scrollbarThumb) {
      this.scrollbarThumb.destroy();
    }

    this.background.destroy();
    this.list.destroy();

    super.destroy(options);
  }

  protected restoreItemsInteractivity() {
    this.interactiveStorage.forEach((element) => {
      element.item.eventMode = element.eventMode;
    });

    this.interactiveStorage.length = 0;
  }

  protected revertClick(item: Container) {
    if (item.eventMode !== 'auto') {
      this.interactiveStorage.push({
        item,
        eventMode: item.eventMode ?? 'auto',
      });

      item.eventMode = 'auto';
    }

    // need to disable click for all children too
    if (item instanceof Container && item.children) {
      item.children.forEach((child) => this.revertClick(child));
    }
  }

  /** True while the strip is being dragged or is still coasting after a fling. */
  get isMoving(): boolean {
    if (!this._trackpad) return false;
    return (
      this.isDragging === 2 || Math.abs(this._trackpad.xAxis.speed) > 0.5 || Math.abs(this._trackpad.yAxis.speed) > 0.5
    );
  }

  get scrollHeight(): number {
    return this.list.height;
  }

  get scrollWidth(): number {
    return this.list.width;
  }
}
