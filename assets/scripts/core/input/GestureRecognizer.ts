/**
 * Pure gesture state machine — no `cc` dependency.
 * Thresholds from 规格书 §6.2.
 */
export type GestureKind = 'tap' | 'double_tap' | 'swipe' | 'long_press' | 'none';

export interface PointerSample {
  x: number;
  y: number;
  timeMs: number;
}

export interface GestureConfig {
  tapMaxMs: number;
  tapMaxMove: number;
  doubleTapWindowMs: number;
  swipeMinMove: number;
  longPressMs: number;
}

export const DEFAULT_GESTURE_CONFIG: GestureConfig = {
  tapMaxMs: 220,
  tapMaxMove: 10,
  doubleTapWindowMs: 300,
  swipeMinMove: 16,
  longPressMs: 480,
};

export interface GestureEvent {
  kind: GestureKind;
  x: number;
  y: number;
  path?: PointerSample[];
}

/**
 * First tap enters pending state; click is only committed after double-tap
 * window expires without a second tap (avoids click-then-double flicker).
 */
export class GestureRecognizer {
  private cfg: GestureConfig;
  private down: PointerSample | null = null;
  private path: PointerSample[] = [];
  private pendingTap: PointerSample | null = null;
  private pendingTimer: ReturnType<typeof setTimeout> | null = null;
  private longTimer: ReturnType<typeof setTimeout> | null = null;
  private swiping = false;
  private onGesture: (ev: GestureEvent) => void;

  constructor(onGesture: (ev: GestureEvent) => void, cfg: Partial<GestureConfig> = {}) {
    this.onGesture = onGesture;
    this.cfg = { ...DEFAULT_GESTURE_CONFIG, ...cfg };
  }

  dispose(): void {
    this.clearTimers();
  }

  pointerDown(x: number, y: number, timeMs: number): void {
    this.down = { x, y, timeMs };
    this.path = [this.down];
    this.swiping = false;
    this.clearLongTimer();
    this.longTimer = setTimeout(() => {
      if (!this.down || this.swiping) return;
      this.clearPendingTap();
      this.onGesture({ kind: 'long_press', x: this.down.x, y: this.down.y });
      this.down = null;
    }, this.cfg.longPressMs);
  }

  pointerMove(x: number, y: number, timeMs: number): void {
    if (!this.down) return;
    this.path.push({ x, y, timeMs });
    const dx = x - this.down.x;
    const dy = y - this.down.y;
    const dist = Math.hypot(dx, dy);
    if (dist >= this.cfg.swipeMinMove) {
      this.swiping = true;
      this.clearLongTimer();
    }
  }

  pointerUp(x: number, y: number, timeMs: number): void {
    this.clearLongTimer();
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
      if (this.pendingTap && timeMs - this.pendingTap.timeMs <= this.cfg.doubleTapWindowMs) {
        const px = this.pendingTap.x;
        const py = this.pendingTap.y;
        this.clearPendingTap();
        // Treat as double tap on first tap position
        this.onGesture({ kind: 'double_tap', x: px, y: py });
        return;
      }
      this.armPendingTap({ x, y, timeMs });
      return;
    }
  }

  private armPendingTap(sample: PointerSample): void {
    this.clearPendingTap();
    this.pendingTap = sample;
    this.pendingTimer = setTimeout(() => {
      const tap = this.pendingTap;
      this.pendingTap = null;
      this.pendingTimer = null;
      if (tap) this.onGesture({ kind: 'tap', x: tap.x, y: tap.y });
    }, this.cfg.doubleTapWindowMs);
  }

  private clearPendingTap(): void {
    if (this.pendingTimer) clearTimeout(this.pendingTimer);
    this.pendingTimer = null;
    this.pendingTap = null;
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
