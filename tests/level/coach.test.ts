import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { LevelsFile } from '../../assets/scripts/core/level/LevelDefinition';
import {
  TECHNIQUE_GUIDE_LEVEL,
  techniqueGuideForLevel,
} from '../../assets/scripts/core/level/LevelTechniques';
import {
  findCoachLesson,
  findCoachStep,
  nextCoachPointer,
  scoreCoachLesson,
  teachCoachMinScore,
} from '../../assets/scripts/core/level/TechniqueCoach';
import { createDefaultSave } from '../../assets/scripts/core/save/SaveTypes';
import { SaveService } from '../../assets/scripts/core/save/SaveService';
import { MemoryStorageAdapter } from '../../assets/scripts/core/save/StorageAdapter';

const file = JSON.parse(
  readFileSync(join(process.cwd(), 'assets/resources/data/levels.json'), 'utf8'),
) as LevelsFile;

describe('interactive technique coach', () => {
  it('builds a T1 exclude step on the teach level (spotlight + targets)', () => {
    const level = file.levels.find((l) => l.id === TECHNIQUE_GUIDE_LEVEL.T1)!;
    const step = findCoachStep(level, 'T1');
    expect(step).not.toBeNull();
    expect(step!.action).toBe('EXCLUDE');
    expect(step!.targetCells.length).toBeGreaterThanOrEqual(2);
    expect(step!.focusCells.length).toBe(level.size);
    expect(step!.messageKey).toMatch(/^coach\.T1_/);
    for (const t of step!.targetCells) {
      expect(step!.focusCells).toContain(t);
    }
  });

  it('builds satisfying coach lessons for every technique guide level', () => {
    for (const [tech, id] of Object.entries(TECHNIQUE_GUIDE_LEVEL)) {
      expect(techniqueGuideForLevel(id!)).toBe(tech);
      const level = file.levels.find((l) => l.id === id)!;
      const steps = findCoachLesson(level, tech as 'T1');
      expect(steps.length, `coach for ${tech} @${id}`).toBeGreaterThan(0);
      expect(scoreCoachLesson(steps)).toBeGreaterThanOrEqual(teachCoachMinScore(tech as 'T1'));
      for (const step of steps) {
        expect(step.targetCells.length).toBeGreaterThan(0);
        expect(step.focusCells.length).toBeGreaterThan(0);
      }
    }
  });

  it('T3 teach is place then cascade exclude', () => {
    const level = file.levels.find((l) => l.id === TECHNIQUE_GUIDE_LEVEL.T3)!;
    const steps = findCoachLesson(level, 'T3');
    expect(steps[0]?.action).toBe('PLACE_CAT');
    if (steps.length > 1) {
      expect(steps[1]?.action).toBe('EXCLUDE');
      expect(steps[1]!.targetCells.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('advances the hand pointer through unfinished targets', () => {
    expect(nextCoachPointer([4, 2, 9], new Set())).toBe(2);
    expect(nextCoachPointer([4, 2, 9], new Set([2]))).toBe(4);
    expect(nextCoachPointer([4, 2, 9], new Set([2, 4, 9]))).toBe(-1);
  });

  it('persists seenTechniqueGuides in save migrate/normalize', () => {
    const storage = new MemoryStorageAdapter();
    const svc = new SaveService(storage);
    const save = createDefaultSave();
    save.progress.seenTechniqueGuides = ['T1'];
    svc.save(save);
    const loaded = svc.load();
    expect(loaded.progress.seenTechniqueGuides).toEqual(['T1']);
  });
});
