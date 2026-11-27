import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { LevelsFile } from '../../assets/scripts/core/level/LevelDefinition';
import {
  TECHNIQUE_GUIDE_LEVEL,
  techniqueGuideForLevel,
} from '../../assets/scripts/core/level/LevelTechniques';
import {
  findCoachStep,
  nextCoachPointer,
} from '../../assets/scripts/core/level/TechniqueCoach';

const file = JSON.parse(
  readFileSync(join(process.cwd(), 'assets/resources/data/levels.json'), 'utf8'),
) as LevelsFile;

describe('interactive technique coach', () => {
  it('builds a T1 exclude step on the teach level (spotlight + targets)', () => {
    const level = file.levels.find((l) => l.id === TECHNIQUE_GUIDE_LEVEL.T1)!;
    const step = findCoachStep(level, 'T1');
    expect(step).not.toBeNull();
    expect(step!.action).toBe('EXCLUDE');
    expect(step!.targetCells.length).toBeGreaterThan(0);
    expect(step!.focusCells.length).toBeGreaterThan(step!.targetCells.length);
    expect(step!.messageKey).toMatch(/^coach\.T1_/);
    for (const t of step!.targetCells) {
      expect(step!.focusCells).toContain(t);
    }
  });

  it('builds coach steps for every technique guide level', () => {
    for (const [tech, id] of Object.entries(TECHNIQUE_GUIDE_LEVEL)) {
      expect(techniqueGuideForLevel(id!)).toBe(tech);
      const level = file.levels.find((l) => l.id === id)!;
      const step = findCoachStep(level, tech as 'T1');
      expect(step, `coach for ${tech} @${id}`).not.toBeNull();
      expect(step!.targetCells.length).toBeGreaterThan(0);
      expect(step!.focusCells.length).toBeGreaterThan(0);
    }
  });

  it('advances the hand pointer through unfinished targets', () => {
    expect(nextCoachPointer([4, 2, 9], new Set())).toBe(2);
    expect(nextCoachPointer([4, 2, 9], new Set([2]))).toBe(4);
    expect(nextCoachPointer([4, 2, 9], new Set([2, 4, 9]))).toBe(-1);
  });
});
