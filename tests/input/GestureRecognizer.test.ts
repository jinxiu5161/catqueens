import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  GestureRecognizer,
  type GestureEvent,
} from '../../assets/scripts/core/input/GestureRecognizer';

describe('GestureRecognizer (15.4 double-tap window)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not emit tap immediately — waits for double-tap window', () => {
    const events: GestureEvent[] = [];
    const g = new GestureRecognizer((e) => events.push(e), { doubleTapWindowMs: 300 });
    g.pointerDown(10, 10, 0);
    g.pointerUp(10, 10, 100);
    expect(events).toEqual([]);
    expect(g.hasPendingTap()).toBe(true);
    vi.advanceTimersByTime(300);
    expect(events).toEqual([{ kind: 'tap', x: 10, y: 10 }]);
    g.dispose();
  });

  it('emits double_tap without a prior tap when second tap arrives in window', () => {
    const events: GestureEvent[] = [];
    const g = new GestureRecognizer((e) => events.push(e), { doubleTapWindowMs: 300 });
    g.pointerDown(10, 10, 0);
    g.pointerUp(10, 10, 80);
    g.pointerDown(12, 11, 200);
    g.pointerUp(12, 11, 280);
    expect(events).toEqual([{ kind: 'double_tap', x: 10, y: 10 }]);
    vi.advanceTimersByTime(500);
    expect(events).toHaveLength(1);
    g.dispose();
  });

  it('rejects far second tap as a new pending tap, not double_tap', () => {
    const events: GestureEvent[] = [];
    const g = new GestureRecognizer((e) => events.push(e), {
      doubleTapWindowMs: 300,
      doubleTapMaxDistance: 24,
    });
    g.pointerDown(0, 0, 0);
    g.pointerUp(0, 0, 50);
    g.pointerDown(100, 100, 120);
    g.pointerUp(100, 100, 180);
    expect(events.filter((e) => e.kind === 'double_tap')).toHaveLength(0);
    expect(g.hasPendingTap()).toBe(true);
    vi.advanceTimersByTime(300);
    expect(events.at(-1)).toEqual({ kind: 'tap', x: 100, y: 100 });
    g.dispose();
  });

  it('emits swipe when movement exceeds threshold', () => {
    const events: GestureEvent[] = [];
    const g = new GestureRecognizer((e) => events.push(e));
    g.pointerDown(0, 0, 0);
    g.pointerMove(30, 0, 40);
    g.pointerUp(40, 0, 80);
    expect(events[0]?.kind).toBe('swipe');
    expect(events[0]?.path?.length).toBeGreaterThan(1);
    g.dispose();
  });

  it('emits long_press then long_press_end on release', () => {
    const events: GestureEvent[] = [];
    const g = new GestureRecognizer((e) => events.push(e), { longPressMs: 480 });
    g.pointerDown(5, 5, 0);
    vi.advanceTimersByTime(480);
    expect(events[0]?.kind).toBe('long_press');
    g.pointerUp(5, 5, 500);
    expect(events[1]?.kind).toBe('long_press_end');
    g.dispose();
  });
});
