import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { LevelsFile } from '../../assets/scripts/core/level/LevelDefinition';
import { coachGuideKeyForLevel } from '../../assets/scripts/core/level/LevelTechniques';
import { findLevelCoachPlan } from '../../assets/scripts/core/level/TechniqueCoach';
import { annotateLevel } from '../../assets/scripts/core/level/TechSolver';
import { isNoGuessLevel } from '../../assets/scripts/core/level/LevelDifficulty';

const file = JSON.parse(
  readFileSync(join(process.cwd(), 'assets/resources/data/levels.json'), 'utf8'),
) as LevelsFile;

describe('early onboarding guides L1/L2/L4/L8', () => {
  it('L1 is T0 guide with requiredTech 0', () => {
    expect(coachGuideKeyForLevel(1)).toBe('T0');
    const level = file.levels.find((l) => l.id === 1)!;
    expect(isNoGuessLevel(level).ok).toBe(true);
    expect(annotateLevel(level).requiredTech).toBe(0);
    expect(level.requiredTech).toBe(0);
    const plan = findLevelCoachPlan(level)!;
    expect(plan.guideKey).toBe('T0');
    expect(plan.steps[0]?.action).toBe('PLACE_CAT');
    expect(plan.steps[0]?.messageText).toBeTruthy();
  });

  it('L2 is T1a guide with prePlaceCats and EXCLUDE hint', () => {
    expect(coachGuideKeyForLevel(2)).toBe('T1a');
    const level = file.levels.find((l) => l.id === 2)!;
    expect(level.size).toBe(5);
    expect(level.prePlaceCats?.length).toBe(1);
    expect(level.requiredTech).toBe(1);
    expect(
      annotateLevel(level, { t1Mode: 'a', initialCats: level.prePlaceCats }).requiredTech,
    ).toBe(1);
    const plan = findLevelCoachPlan(level)!;
    expect(plan.guideKey).toBe('T1a');
    expect(plan.prePlaceCats).toEqual(level.prePlaceCats);
    expect(plan.steps[0]?.action).toBe('EXCLUDE');
    expect(plan.steps[0]!.targetCells.length).toBeGreaterThan(0);
  });

  it('L4 is T1b guide with prePlaceCats', () => {
    expect(coachGuideKeyForLevel(4)).toBe('T1b');
    const level = file.levels.find((l) => l.id === 4)!;
    expect(level.size).toBe(5);
    expect(level.guide).toBe(true);
    expect(level.prePlaceCats?.length).toBe(1);
    expect(level.requiredTech).toBe(1);
    const plan = findLevelCoachPlan(level)!;
    expect(plan.guideKey).toBe('T1b');
    expect(plan.prePlaceCats).toEqual(level.prePlaceCats);
    expect(plan.steps[0]?.action).toBe('EXCLUDE');
  });

  it('L8 is T2 guide', () => {
    expect(coachGuideKeyForLevel(8)).toBe('T2');
    const level = file.levels.find((l) => l.id === 8);
    if (!level) return;
    expect(level.guide).toBe(true);
    const plan = findLevelCoachPlan(level)!;
    expect(plan.guideKey).toBe('T2');
    expect(plan.steps[0]?.action).toBe('EXCLUDE');
  });

  it('L3/L5/L15 have no interactive technique coach', () => {
    expect(coachGuideKeyForLevel(3)).toBeNull();
    expect(coachGuideKeyForLevel(5)).toBeNull();
    expect(coachGuideKeyForLevel(15)).toBeNull();
    const l3 = file.levels.find((l) => l.id === 3);
    const l15 = file.levels.find((l) => l.id === 15);
    if (l3) expect(findLevelCoachPlan(l3)).toBeNull();
    if (l15) expect(findLevelCoachPlan(l15)).toBeNull();
  });
});
