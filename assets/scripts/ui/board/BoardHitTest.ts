/** Pure board hit-test (no `cc`) — shared by BoardView and unit tests. */
export function hitTestBoard(
  localX: number,
  localY: number,
  size: number,
  boardSizePx: number,
): number {
  if (size <= 0 || boardSizePx <= 0) return -1;
  const cell = boardSizePx / size;
  const origin = -boardSizePx / 2;
  const col = Math.floor((localX - origin) / cell);
  const row = Math.floor((boardSizePx / 2 - localY) / cell);
  if (row < 0 || col < 0 || row >= size || col >= size) return -1;
  return row * size + col;
}

/** Center of cell in board local coordinates (matches BoardView layout). */
export function cellCenterLocal(index: number, size: number, boardSizePx: number): { x: number; y: number } {
  const cell = boardSizePx / size;
  const origin = -boardSizePx / 2;
  const row = Math.floor(index / size);
  const col = index % size;
  return {
    x: origin + col * cell + cell / 2,
    y: origin + (size - 1 - row) * cell + cell / 2,
  };
}
