/**
 * Pure gesture state machine — no `cc` dependency.
 * Thresholds from 规格书 §6.2.
 *
 * Critical: first tap stays pending until the double-tap window ends.
 * Never emit `tap` immediately, then undo on double-tap (avoids state flicker).
 */
export type GestureKind = 'tap' | 'double_tap' | 'swipe' | 'long_press' | 'long_press_end' | 'none';

export interface PointerSample {
  x: number;
  y: number;
  timeMs: number;
}

export interface GestureConfig {
  tapMaxMs: number;
  tapMaxMove: number;
  doubleTapWindowMs: number;
  /** Max distance between two taps to count as double-tap (same cell). */
  doubleTapMaxDistance: number;
  swipeMinMove: number;
  longPressMs: number;
}

export const DEFAULT_GESTURE_CONFIG: GestureConfig = {
  tapMaxMs: 220,
  tapMaxMove: 10,
  doubleTapWindowMs: 300,
  doubleTapMaxDistance: 24,
  swipeMinMove: 16,
  longPressMs: 480,
};

export interface GestureEvent {
  kind: GestureKind;
  x: number;
  y: number;
  path?: PointerSample[];
}

export type GestureListener = (ev: GestureEvent) => void;

/**
 * First tap enters pending state; click commits only after double-tap
 * window expires without a second tap.
 */
export class GestureRecognizer {
  private cfg: GestureConfig;
  private down: PointerSample | null = null;
  private path: PointerSample[] = [];
  private pendingTap: PointerSample | null = null;
  private pendingTimer: ReturnType<typeof setTimeout> | null = null;
  private longTimer: ReturnType<typeof setTimeout> | null = null;
  private swiping = false;
  private longPressActive = false;
  private onGesture: GestureListener;
  private onPendingTapChange: ((pending: PointerSample | null) => void) | null = null;

  constructor(onGesture: GestureListener, cfg: Partial<GestureConfig> = {}) {
    this.onGesture = onGesture;
    this.cfg = { ...DEFAULT_GESTURE_CONFIG, ...cfg };
  }

  /** Optional UI hook: show light feedback while waiting for possible double-tap. */
  setPendingTapListener(listener: ((pending: PointerSample | null) => void) | null): void {
    this.onPendingTapChange = listener;
  }

  dispose(): void {
    this.clearTimers();
    this.longPressActive = false;
  }

  pointerDown(x: number, y: number, timeMs: number): void {
    this.down = { x, y, timeMs };
    this.path = [this.down];
    this.swiping = false;
    this.longPressActive = false;
    this.clearLongTimer();
    this.longTimer = setTimeout(() => {
      if (!this.down || this.swiping) return;
      this.clearPendingTap();
      this.longPressActive = true;
      this.onGesture({ kind: 'long_press', x: this.down.x, y: this.down.y });
    }, this.cfg.longPressMs);
  }

  pointerMove(x: number, y: number, timeMs: number): void {
    if (!this.down) return;
    this.path.push({ x, y, timeMs });
    const dist = Math.hypot(x - this.down.x, y - this.down.y);
    if (dist >= this.cfg.swipeMinMove) {
      this.swiping = true;
      this.clearLongTimer();
      if (this.longPressActive) {
        this.longPressActive = false;
        this.onGesture({ kind: 'long_press_end', x, y });
      }
    }
  }

  pointerUp(x: number, y: number, timeMs: number): void {
    this.clearLongTimer();

    if (this.longPressActive) {
      this.longPressActive = false;
      this.down = null;
      this.onGesture({ kind: 'long_press_end', x, y });
      return;
    }

    if (!this.down) return;
    const start = this.down;
    this.down = null;
    const dist = Math.hypot(x - start.x, y - start.y);
    const dt = timeMs - start.timeMs;

    if (this.swiping || dist >= this.cfg.swipeMinMove) {
      this.clearPendingTap();
      this.onGesture({ kind: 'swipe', x, y, path: [...this.path, { x, y, timeMs }] });
      return;
    }

    if (dt <= this.cfg.tapMaxMs && dist <= this.cfg.tapMaxMove) {
      if (
        this.pendingTap &&
        timeMs - this.pendingTap.timeMs <= this.cfg.doubleTapWindowMs &&
        Math.hypot(x - this.pendingTap.x, y - this.pendingTap.y) <= this.cfg.doubleTapMaxDistance
      ) {
        const px = this.pendingTap.x;
        const py = this.pendingTap.y;
        this.clearPendingTap();
        this.onGesture({ kind: 'double_tap', x: px, y: py });
        return;
      }
      this.armPendingTap({ x, y, timeMs });
    }
  }

  /** Test helper: whether a tap is waiting in the double-tap window. */
  hasPendingTap(): boolean {
    return this.pendingTap != null;
  }

  private armPendingTap(sample: PointerSample): void {
    this.clearPendingTap();
    this.pendingTap = sample;
    this.onPendingTapChange?.(sample);
    this.pendingTimer = setTimeout(() => {
      const tap = this.pendingTap;
      this.pendingTap = null;
      this.pendingTimer = null;
      this.onPendingTapChange?.(null);
      if (tap) this.onGesture({ kind: 'tap', x: tap.x, y: tap.y });
    }, this.cfg.doubleTapWindowMs);
  }

  private clearPendingTap(): void {
    if (this.pendingTimer) clearTimeout(this.pendingTimer);
    this.pendingTimer = null;
    if (this.pendingTap) {
      this.pendingTap = null;
      this.onPendingTapChange?.(null);
    }
  }

  private clearLongTimer(): void {
    if (this.longTimer) clearTimeout(this.longTimer);
    this.longTimer = null;
  }

  private clearTimers(): void {
    this.clearPendingTap();
    this.clearLongTimer();
  }
}
