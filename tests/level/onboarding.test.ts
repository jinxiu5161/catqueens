import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { LevelsFile } from '../../assets/scripts/core/level/LevelDefinition';
import { coachGuideKeyForLevel } from '../../assets/scripts/core/level/LevelTechniques';
import {
  findL3Lesson,
  findLevelCoachPlan,
  singletonSolutionCats,
} from '../../assets/scripts/core/level/TechniqueCoach';
import {
  level2RowColChainOk,
  level3AdjChainOk,
  level29NeedsT2ForFirstCat,
} from '../../assets/scripts/core/level/OnboardingChain';
import {
  firstForcedPlacement,
  isNoGuessLevel,
} from '../../assets/scripts/core/level/LevelDifficulty';

const file = JSON.parse(
  readFileSync(join(process.cwd(), 'assets/resources/data/levels.json'), 'utf8'),
) as LevelsFile;

describe('early onboarding levels 1–3', () => {
  it('L1 has place-cat then row/col exclude coach', () => {
    expect(coachGuideKeyForLevel(1)).toBe('L1');
    const level = file.levels.find((l) => l.id === 1)!;
    expect(singletonSolutionCats(level).length).toBeGreaterThanOrEqual(2);
    expect(isNoGuessLevel(level).ok).toBe(true);
    const plan = findLevelCoachPlan(level)!;
    expect(plan.guideKey).toBe('L1');
    expect(plan.steps).toHaveLength(2);
    expect(plan.steps[0]?.action).toBe('PLACE_CAT');
    expect(plan.steps[1]?.action).toBe('EXCLUDE');
    expect(plan.steps[1]!.targetCells.length).toBeGreaterThanOrEqual(4);
  });

  it('L2 needs row/col exclude after the first cat to reveal the next', () => {
    expect(coachGuideKeyForLevel(2)).toBeNull();
    const level = file.levels.find((l) => l.id === 2)!;
    expect(singletonSolutionCats(level)).toHaveLength(1);
    expect(isNoGuessLevel(level).ok).toBe(true);
    expect(level2RowColChainOk(level)).toBe(true);
  });

  it('L3 needs neighbor exclude to shrink another color to one open cell', () => {
    expect(coachGuideKeyForLevel(3)).toBe('L3');
    const level = file.levels.find((l) => l.id === 3)!;
    expect(singletonSolutionCats(level)).toHaveLength(1);
    expect(level3AdjChainOk(level)).toBe(true);
    const { steps, prePlaceCats } = findL3Lesson(level);
    expect(prePlaceCats).toHaveLength(1);
    expect(steps).toHaveLength(1);
    expect(steps[0]?.action).toBe('EXCLUDE');
    expect(steps[0]!.targetCells.length).toBeGreaterThanOrEqual(3);
    const plan = findLevelCoachPlan(level)!;
    expect(plan.guideKey).toBe('L3');
    expect(plan.prePlaceCats).toEqual(prePlaceCats);
  });

  it('L15 has no interactive technique coach', () => {
    expect(coachGuideKeyForLevel(15)).toBeNull();
    expect(findLevelCoachPlan(file.levels.find((l) => l.id === 15)!)).toBeNull();
  });

  it('L29 needs T2 exclude before the first cat is forced', () => {
    const level = file.levels.find((l) => l.id === 29)!;
    expect(coachGuideKeyForLevel(29)).toBe('T2');
    expect(firstForcedPlacement(level)).toBeNull();
    expect(level29NeedsT2ForFirstCat(level)).toBe(true);
    const plan = findLevelCoachPlan(level)!;
    expect(plan.steps[0]?.regionIds?.length).toBeGreaterThanOrEqual(2);
  });
});

