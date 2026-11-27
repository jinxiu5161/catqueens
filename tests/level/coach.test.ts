import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { LevelsFile } from '../../assets/scripts/core/level/LevelDefinition';
import {
  TECHNIQUE_GUIDE_LEVEL,
  coachGuideKeyForLevel,
  techniqueGuideForLevel,
} from '../../assets/scripts/core/level/LevelTechniques';
import {
  findLevelCoachPlan,
  nextCoachPointer,
} from '../../assets/scripts/core/level/TechniqueCoach';
import { createDefaultSave } from '../../assets/scripts/core/save/SaveTypes';
import { SaveService } from '../../assets/scripts/core/save/SaveService';
import { MemoryStorageAdapter } from '../../assets/scripts/core/save/StorageAdapter';

const file = JSON.parse(
  readFileSync(join(process.cwd(), 'assets/resources/data/levels.json'), 'utf8'),
) as LevelsFile;

const GUIDE_IDS = [1, 2, 4, 8, 16, 51] as const;

describe('interactive technique coach', () => {
  it('guide keys map to L1/L2/L4/L8/L16/L51', () => {
    expect(coachGuideKeyForLevel(1)).toBe('T0');
    expect(coachGuideKeyForLevel(2)).toBe('T1a');
    expect(coachGuideKeyForLevel(4)).toBe('T1b');
    expect(coachGuideKeyForLevel(8)).toBe('T2');
    expect(coachGuideKeyForLevel(16)).toBe('T3');
    expect(coachGuideKeyForLevel(51)).toBe('T4');
    expect(TECHNIQUE_GUIDE_LEVEL.T0).toBe(1);
    expect(TECHNIQUE_GUIDE_LEVEL.T2).toBe(8);
  });

  it('findLevelCoachPlan is non-null when hint is present on guide levels', () => {
    for (const id of GUIDE_IDS) {
      const level = file.levels.find((l) => l.id === id);
      if (!level) continue; // pack may be a short LEVEL_COUNT run
      expect(techniqueGuideForLevel(id) != null || id === 4).toBe(true);
      expect(level.guide, `level ${id} guide`).toBe(true);
      expect(level.hint, `level ${id} hint`).toBeTruthy();
      const plan = findLevelCoachPlan(level);
      expect(plan, `plan for ${id}`).not.toBeNull();
      expect(plan!.guideKey).toBe(coachGuideKeyForLevel(id));
      expect(plan!.steps.length).toBeGreaterThan(0);
      expect(plan!.steps[0]!.targetCells.length).toBeGreaterThan(0);
      expect(plan!.steps[0]!.messageText || plan!.steps[0]!.messageKey).toBeTruthy();
    }
  });

  it('L1 coach places a cat; L2/L4 exclude', () => {
    const l1 = file.levels.find((l) => l.id === 1);
    const l2 = file.levels.find((l) => l.id === 2);
    const l4 = file.levels.find((l) => l.id === 4);
    if (l1) {
      const plan = findLevelCoachPlan(l1)!;
      expect(plan.steps[0]?.action).toBe('PLACE_CAT');
    }
    if (l2) {
      const plan = findLevelCoachPlan(l2)!;
      expect(plan.steps[0]?.action).toBe('EXCLUDE');
      expect(plan.steps[0]!.targetCells.length).toBeGreaterThan(0);
    }
    if (l4) {
      const plan = findLevelCoachPlan(l4)!;
      expect(plan.prePlaceCats.length).toBe(1);
      expect(plan.steps[0]?.action).toBe('EXCLUDE');
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
    save.progress.seenTechniqueGuides = ['T1a'];
    svc.save(save);
    const loaded = svc.load();
    expect(loaded.progress.seenTechniqueGuides).toEqual(['T1a']);
  });
});
