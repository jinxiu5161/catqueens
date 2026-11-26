import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BoardInputController } from '../../assets/scripts/core/input/BoardInputController';
import { cellCenterLocal, hitTestBoard } from '../../assets/scripts/ui/board/BoardHitTest';

describe('BoardInputController + hitTest (15.4)', () => {
  const size = 4;
  const boardPx = 400;

  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('maps cell centers to correct indexes', () => {
    for (let i = 0; i < size * size; i++) {
      const { x, y } = cellCenterLocal(i, size, boardPx);
      expect(hitTestBoard(x, y, size, boardPx)).toBe(i);
    }
  });

  it('tap → onTap after window; double tap → onDoubleTap only', () => {
    const taps: number[] = [];
    const doubles: number[] = [];
    const c0 = cellCenterLocal(0, size, boardPx);
    const controller = new BoardInputController({
      hitTest: (x, y) => hitTestBoard(x, y, size, boardPx),
      onTap: (i) => taps.push(i),
      onDoubleTap: (i) => doubles.push(i),
      onSwipe: () => undefined,
      onLongPress: () => undefined,
      onLongPressEnd: () => undefined,
    });

    controller.pointerDown(0, c0.x, c0.y, 0);
    controller.pointerUp(0, c0.x, c0.y, 80);
    expect(taps).toEqual([]);
    expect(doubles).toEqual([]);

    controller.pointerDown(0, c0.x, c0.y, 160);
    controller.pointerUp(0, c0.x, c0.y, 220);
    expect(doubles).toEqual([0]);
    expect(taps).toEqual([]);

    vi.advanceTimersByTime(500);
    expect(taps).toEqual([]);
    controller.dispose();
  });

  it('swipe paints each cell live as the finger passes', () => {
    const painted: number[] = [];
    let began = 0;
    let ended = 0;
    const controller = new BoardInputController({
      hitTest: (x, y) => hitTestBoard(x, y, size, boardPx),
      onTap: () => undefined,
      onDoubleTap: () => undefined,
      onSwipeBegin: () => {
        began += 1;
      },
      onSwipePaint: (i) => painted.push(i),
      onSwipeEnd: () => {
        ended += 1;
      },
      onLongPress: () => undefined,
      onLongPressEnd: () => undefined,
    });
    const a = cellCenterLocal(0, size, boardPx);
    const b = cellCenterLocal(1, size, boardPx);
    const c = cellCenterLocal(2, size, boardPx);
    controller.pointerDown(0, a.x, a.y, 0);
    controller.pointerMove(1, b.x, b.y, 30);
    expect(began).toBe(1);
    expect(painted).toEqual([0, 1]);
    controller.pointerMove(2, c.x, c.y, 50);
    expect(painted).toEqual([0, 1, 2]);
    controller.pointerUp(2, c.x, c.y, 70);
    expect(ended).toBe(1);
    controller.dispose();
  });

  it('long press highlights then clears on release', () => {
    const presses: number[] = [];
    let ended = 0;
    const c5 = cellCenterLocal(5, size, boardPx);
    const controller = new BoardInputController({
      hitTest: (x, y) => hitTestBoard(x, y, size, boardPx),
      onTap: () => undefined,
      onDoubleTap: () => undefined,
      onSwipe: () => undefined,
      onLongPress: (i) => presses.push(i),
      onLongPressEnd: () => {
        ended += 1;
      },
    });
    controller.pointerDown(5, c5.x, c5.y, 0);
    vi.advanceTimersByTime(480);
    expect(presses).toEqual([5]);
    controller.pointerUp(5, c5.x, c5.y, 500);
    expect(ended).toBe(1);
    controller.dispose();
  });
});
