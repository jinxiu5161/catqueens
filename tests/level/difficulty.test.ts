import { describe, expect, it } from 'vitest';
import { isNoGuessLevel, rateLevel, tierFromStars } from '../../assets/scripts/core/level/LevelDifficulty';
import type { LevelDefinition } from '../../assets/scripts/core/puzzle/PuzzleTypes';

/** Tiny 4×4 with two size-1 regions — should be no-guess. */
function easy4(): LevelDefinition {
  // Solution: (0,1)=1, (1,3)=7, (2,0)=8, (3,2)=14 — classic unique queens-like
  // Regions: make 1 and 8 singletons; grow others
  const size = 4;
  const solution = [1, 7, 8, 14];
  const regions = Array.from({ length: 16 }, () => 0);
  // Assign by simple voronoi then force singletons for region 0? Use explicit map:
  // region ids match solution index
  const map = [
    2, 0, 0, 1, // row0: cell1 is sol region0 singleton-ish
    2, 2, 1, 1,
    2, 3, 3, 1,
    2, 3, 3, 3,
  ];
  // Fix: solution cells must belong to their region index
  // sol 1 → region 0, sol 7 → region 1, sol 8 → region 2, sol 14 → region 3
  void map;
  const regions2 = [
    0, 0, 0, 1,
    2, 0, 1, 1,
    2, 2, 3, 1,
    2, 3, 3, 3,
  ];
  // Ensure solution cells
  regions2[1] = 0;
  regions2[7] = 1;
  regions2[8] = 2;
  regions2[14] = 3;
  return { id: 1, size, regions: regions2, solution };
}

describe('LevelDifficulty', () => {
  it('maps stars to Chinese tiers', () => {
    expect(tierFromStars(1)).toBe('入门');
    expect(tierFromStars(3)).toBe('简单');
    expect(tierFromStars(5)).toBe('普通');
    expect(tierFromStars(6)).toBe('进阶');
    expect(tierFromStars(8)).toBe('困难');
    expect(tierFromStars(10)).toBe('专家');
  });

  it('rates a level with stars 1–10', () => {
    const level = easy4();
    const rating = rateLevel(level);
    expect(rating.stars).toBeGreaterThanOrEqual(1);
    expect(rating.stars).toBeLessThanOrEqual(10);
    expect(typeof rating.noGuess).toBe('boolean');
  });

  it('isNoGuessLevel returns structured result', () => {
    const r = isNoGuessLevel(easy4());
    expect(r).toHaveProperty('ok');
    expect(r).toHaveProperty('steps');
  });
});
