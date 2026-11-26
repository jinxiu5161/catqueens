import { GestureRecognizer, type GestureEvent } from './GestureRecognizer';

export interface BoardInputTarget {
  hitTest(localX: number, localY: number): number;
  onTap(index: number): void;
  onDoubleTap(index: number): void;
  onSwipe(indexes: number[]): void;
  onLongPress(index: number): void;
  onLongPressEnd(): void;
}

/**
 * Bridges raw pointer stream → gestures → GameSession actions.
 * Keeps UI free of rule logic.
 */
export class BoardInputController {
  private gesture: GestureRecognizer;
  private swipeIndexes: number[] = [];
  private lastIndex = -1;

  constructor(private readonly target: BoardInputTarget) {
    this.gesture = new GestureRecognizer((ev) => this.onGesture(ev));
  }

  dispose(): void {
    this.gesture.dispose();
  }

  pointerDown(index: number, x: number, y: number, timeMs: number): void {
    this.swipeIndexes = index >= 0 ? [index] : [];
    this.lastIndex = index;
    this.gesture.pointerDown(x, y, timeMs);
  }

  pointerMove(index: number, x: number, y: number, timeMs: number): void {
    if (index >= 0 && index !== this.lastIndex) {
      this.swipeIndexes.push(index);
      this.lastIndex = index;
    }
    this.gesture.pointerMove(x, y, timeMs);
  }

  pointerUp(index: number, x: number, y: number, timeMs: number): void {
    if (index >= 0) this.swipeIndexes.push(index);
    this.gesture.pointerUp(x, y, timeMs);
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
      const unique: number[] = [];
      const seen = new Set<number>();
      for (const i of this.swipeIndexes) {
        if (i < 0 || seen.has(i)) continue;
        seen.add(i);
        unique.push(i);
      }
      if (ev.path) {
        for (const p of ev.path) {
          const idx = this.target.hitTest(p.x, p.y);
          if (idx >= 0 && !seen.has(idx)) {
            seen.add(idx);
            unique.push(idx);
          }
        }
      }
      this.target.onSwipe(unique);
      this.target.onLongPressEnd();
      return;
    }
    if (ev.kind === 'long_press') {
      const idx = this.target.hitTest(ev.x, ev.y);
      if (idx >= 0) this.target.onLongPress(idx);
    }
  }
}
