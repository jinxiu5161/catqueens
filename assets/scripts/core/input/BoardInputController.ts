import { GestureRecognizer, type GestureEvent, type PointerSample } from './GestureRecognizer';

export interface BoardInputTarget {
  hitTest(localX: number, localY: number): number;
  onTap(index: number): void;
  onDoubleTap(index: number): void;
  /** Fired once when a swipe stroke starts. */
  onSwipeBegin?(): void;
  /** Fired live as the finger enters each cell during a swipe. */
  onSwipePaint?(index: number): void;
  /** Fired when the swipe stroke ends (even if no cells painted). */
  onSwipeEnd?(): void;
  /** @deprecated Prefer begin/paint/end; kept for batch callers. */
  onSwipe?(indexes: number[]): void;
  onLongPress(index: number): void;
  onLongPressEnd(): void;
  onPendingTap?(index: number | null): void;
}

/**
 * Bridges raw pointer stream → gestures → GameSession actions.
 * Swipe paints exclude live per cell; CAT cells are left to the session to skip.
 */
export class BoardInputController {
  private gesture: GestureRecognizer;
  private swipeIndexes: number[] = [];
  private lastIndex = -1;
  private swipeStarted = false;
  /** Last cell we forwarded to onSwipePaint — allow re-entry when sliding back. */
  private lastPaintedIndex = -1;

  constructor(private readonly target: BoardInputTarget) {
    this.gesture = new GestureRecognizer((ev) => this.onGesture(ev));
    this.gesture.setPendingTapListener((pending) => this.onPending(pending));
  }

  dispose(): void {
    this.gesture.dispose();
  }

  pointerDown(index: number, x: number, y: number, timeMs: number): void {
    this.swipeIndexes = index >= 0 ? [index] : [];
    this.lastIndex = index;
    this.swipeStarted = false;
    this.lastPaintedIndex = -1;
    this.gesture.pointerDown(x, y, timeMs);
  }

  pointerMove(index: number, x: number, y: number, timeMs: number): void {
    this.gesture.pointerMove(x, y, timeMs);
    if (this.gesture.isSwiping()) {
      this.ensureSwipeStarted();
      if (index >= 0) this.paintCell(index);
    }
    if (index >= 0 && index !== this.lastIndex) {
      this.swipeIndexes.push(index);
      this.lastIndex = index;
    }
  }

  pointerUp(index: number, x: number, y: number, timeMs: number): void {
    if (index >= 0) {
      this.swipeIndexes.push(index);
      if (this.gesture.isSwiping() || this.swipeStarted) {
        this.ensureSwipeStarted();
        this.paintCell(index);
      }
    }
    this.gesture.pointerUp(x, y, timeMs);
  }

  private ensureSwipeStarted(): void {
    if (this.swipeStarted) return;
    this.swipeStarted = true;
    this.target.onSwipeBegin?.();
    for (const i of this.swipeIndexes) this.paintCell(i);
  }

  private paintCell(index: number): void {
    if (index < 0) return;
    // Only fire when entering a different cell (supports swipe-back toggle)
    if (index === this.lastPaintedIndex) return;
    this.lastPaintedIndex = index;
    this.target.onSwipePaint?.(index);
  }

  private onPending(pending: PointerSample | null): void {
    if (!this.target.onPendingTap) return;
    if (!pending) {
      this.target.onPendingTap(null);
      return;
    }
    const idx = this.target.hitTest(pending.x, pending.y);
    this.target.onPendingTap(idx >= 0 ? idx : null);
  }

  private onGesture(ev: GestureEvent): void {
    if (ev.kind === 'tap') {
      const idx = this.target.hitTest(ev.x, ev.y);
      if (idx >= 0) this.target.onTap(idx);
      this.target.onLongPressEnd();
      return;
    }
    if (ev.kind === 'double_tap') {
      const idx = this.target.hitTest(ev.x, ev.y);
      if (idx >= 0) this.target.onDoubleTap(idx);
      this.target.onLongPressEnd();
      return;
    }
    if (ev.kind === 'swipe') {
      this.ensureSwipeStarted();
      if (ev.path) {
        for (const p of ev.path) {
          const idx = this.target.hitTest(p.x, p.y);
          this.paintCell(idx);
        }
      }
      if (this.target.onSwipeEnd) {
        this.target.onSwipeEnd();
      } else if (this.target.onSwipe) {
        this.target.onSwipe([...this.swipeIndexes]);
      }
      this.swipeStarted = false;
      this.lastPaintedIndex = -1;
      this.target.onLongPressEnd();
      return;
    }
    if (ev.kind === 'long_press') {
      const idx = this.target.hitTest(ev.x, ev.y);
      if (idx >= 0) this.target.onLongPress(idx);
      return;
    }
    if (ev.kind === 'long_press_end') {
      this.target.onLongPressEnd();
    }
  }
}
