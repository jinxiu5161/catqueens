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
import { isNoGuessLevel } from '../../assets/scripts/core/level/LevelDifficulty';

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

  it('L2 is a row/col practice board with singletons', () => {
    expect(coachGuideKeyForLevel(2)).toBeNull();
    const level = file.levels.find((l) => l.id === 2)!;
    expect(singletonSolutionCats(level).length).toBeGreaterThanOrEqual(2);
    expect(isNoGuessLevel(level).ok).toBe(true);
  });

  it('L3 pre-places a singleton and coaches neighbor excludes', () => {
    expect(coachGuideKeyForLevel(3)).toBe('L3');
    const level = file.levels.find((l) => l.id === 3)!;
    const { steps, prePlaceCats } = findL3Lesson(level);
    expect(prePlaceCats).toHaveLength(1);
    expect(steps).toHaveLength(1);
    expect(steps[0]?.action).toBe('EXCLUDE');
    expect(steps[0]!.targetCells.length).toBeGreaterThanOrEqual(3);
    const plan = findLevelCoachPlan(level)!;
    expect(plan.guideKey).toBe('L3');
    expect(plan.prePlaceCats).toEqual(prePlaceCats);
  });
});
