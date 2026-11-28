import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { LevelsFile } from '../../assets/scripts/core/level/LevelDefinition';
import {
  TECHNIQUE_GUIDE_LEVEL,
  TECHNIQUE_LABELS,
  allowedTechsFor,
  analyzeTechniques,
  coachGuideKeyForLevel,
  curriculumFor,
  techniqueGuideForLevel,
} from '../../assets/scripts/core/level/LevelTechniques';
import { annotateLevel, type TechId } from '../../assets/scripts/core/level/TechSolver';
import { singletonSolutionCats } from '../../assets/scripts/core/level/TechniqueCoach';

const file = JSON.parse(
  readFileSync(join(process.cwd(), 'assets/resources/data/levels.json'), 'utf8'),
) as LevelsFile;

describe('technique curriculum', () => {
  it('exposes Chinese labels for T0–T4', () => {
    expect(Object.keys(TECHNIQUE_LABELS).sort()).toEqual(['T0', 'T1', 'T2', 'T3', 'T4']);
    for (const id of Object.keys(TECHNIQUE_LABELS) as (keyof typeof TECHNIQUE_LABELS)[]) {
      expect(TECHNIQUE_LABELS[id].length).toBeGreaterThan(0);
    }
  });

  it('curriculum milestones match intended techniques', () => {
    expect(curriculumFor(1).technique).toBe('T0');
    expect(curriculumFor(1).guide).toBe(true);
    expect(curriculumFor(1).allowedTechs).toEqual([0]);
    expect(curriculumFor(2).technique).toBe('T1');
    expect(curriculumFor(2).guideKey).toBe('T1a');
    expect(curriculumFor(2).size).toBe(5);
    expect(curriculumFor(2).minSingles).toBeGreaterThanOrEqual(1);
    expect(curriculumFor(2).requireLinePin).toBeFalsy();
    expect(curriculumFor(2).allowedTechs).toEqual([0, 1]);
    expect(curriculumFor(3).pure).toBe(true);
    expect(curriculumFor(4).guideKey).toBe('T1b');
    expect(curriculumFor(4).size).toBe(5);
    expect(curriculumFor(5).technique).toBe('T1');
    expect(curriculumFor(8).technique).toBe('T2');
    expect(curriculumFor(8).size).toBe(5);
    expect(curriculumFor(8).maxSingles).toBe(0);
    expect(curriculumFor(8).allowedTechs).toEqual([0, 1, 2]);
    expect(curriculumFor(16).technique).toBe('T3');
    expect(curriculumFor(16).requirePigeonhole).toBe(2);
    expect(curriculumFor(16).allowedTechs).toEqual([0, 1, 2, 3]);
    expect(curriculumFor(51).technique).toBe('T4');
    expect(curriculumFor(51).allowedTechs).toEqual([0, 1, 2, 3, 4]);
    expect(curriculumFor(121).size).toBe(7);
    // 高级B: aux only T0,T1 + primary (L121 slot → T3 on 7×7)
    expect(curriculumFor(121).technique).toBe('T3');
    expect(allowedTechsFor(121)).toEqual([0, 1, 3]);
    // 8×8 高级B remaps T3 slots to T4 (k=2 unique boards too sparse)
    expect(curriculumFor(181).size).toBe(8);
    expect(curriculumFor(181).technique).toBe('T4');
    expect(allowedTechsFor(181)).toEqual([0, 1, 4]);
    expect(curriculumFor(251).size).toBe(8);
    expect(curriculumFor(251).allowedTechs).toEqual([0, 1, 2, 3, 4]);
    expect(curriculumFor(401).technique).toBe('T4');
    expect(curriculumFor(401).size).toBe(9);
  });

  it('technique guides fire on teach levels', () => {
    expect(techniqueGuideForLevel(1)).toBe('T0');
    expect(techniqueGuideForLevel(2)).toBe('T1');
    expect(techniqueGuideForLevel(8)).toBe('T2');
    expect(techniqueGuideForLevel(16)).toBe('T3');
    expect(techniqueGuideForLevel(51)).toBe('T4');
    expect(techniqueGuideForLevel(3)).toBeNull();
    expect(techniqueGuideForLevel(5)).toBeNull();
    expect(coachGuideKeyForLevel(1)).toBe('T0');
    expect(coachGuideKeyForLevel(2)).toBe('T1a');
    expect(coachGuideKeyForLevel(4)).toBe('T1b');
    expect(coachGuideKeyForLevel(8)).toBe('T2');
    expect(TECHNIQUE_GUIDE_LEVEL.T1).toBe(2);
    expect(TECHNIQUE_GUIDE_LEVEL.T2).toBe(8);
  });

  it('generated pack follows curriculum technique tags', () => {
    for (const level of file.levels) {
      const lesson = curriculumFor(level.id);
      expect(level.technique, `level ${level.id}`).toBe(lesson.technique);
      expect(level.size, `level ${level.id}`).toBe(lesson.size);
      if (lesson.requireNoGuess) {
        expect(level.noGuess, `level ${level.id} noGuess`).toBe(true);
      }
    }
  });

  it('L1 is pure T0 (requiredTech 0, techCombo only 0)', () => {
    const level = file.levels.find((l) => l.id === 1)!;
    const allowed = curriculumFor(1).allowedTechs as TechId[];
    const ann = annotateLevel(level, { allowedTechs: allowed, pigeonK: 2 });
    expect(ann.requiredTech).toBe(0);
    expect(ann.solved).toBe(true);
    expect(ann.techCombo.every((t) => t === 0)).toBe(true);
    expect(level.requiredTech).toBe(0);
    expect(level.techCombo?.every((t) => t === 0)).toBe(true);
  });

  it('L2 T1a guide uses prePlaceCats and requiredTech 1', () => {
    const level = file.levels.find((l) => l.id === 2)!;
    expect(level.size).toBe(5);
    expect(level.prePlaceCats?.length).toBe(1);
    expect(level.requiredTech).toBe(1);
    const ann = annotateLevel(level, {
      t1Mode: 'a',
      initialCats: level.prePlaceCats,
      allowedTechs: curriculumFor(2).allowedTechs as TechId[],
      pigeonK: 2,
    });
    expect(ann.requiredTech).toBe(1);
    expect(ann.firstAction?.kind).toBe('T1a');
    expect(ann.solved).toBe(true);
  });

  it('T3 sample requires pigeonhole-2 structure (not line-pin alone)', () => {
    const level = file.levels.find((l) => l.id === 16)!;
    if (!level) return;
    const flags = analyzeTechniques(level);
    expect(flags.hasPigeonhole2).toBe(true);
  });

  it('every level solves under lesson.allowedTechs with primary requiredTech', () => {
    for (const level of file.levels) {
      const lesson = curriculumFor(level.id);
      const opts: {
        allowedTechs: TechId[];
        pigeonK: 2;
        t1Mode?: 'full' | 'a' | 'b';
        initialCats?: number[];
      } = {
        allowedTechs: lesson.allowedTechs as TechId[],
        pigeonK: 2,
      };
      if (lesson.technique === 'T1') {
        opts.t1Mode =
          lesson.guideKey === 'T1a' ? 'a' : lesson.guideKey === 'T1b' ? 'b' : 'full';
        // Match generator: seed a singleton so pending T1 is the required stuck tech.
        const cat =
          level.prePlaceCats?.[0] ?? singletonSolutionCats(level)[0] ?? level.solution?.[0];
        if (cat != null) opts.initialCats = [cat];
      }
      const ann = annotateLevel(level, opts);
      expect(ann.solved, `L${level.id} solved`).toBe(true);
      expect(ann.requiredTech, `L${level.id} requiredTech`).toBe(
        ({ T0: 0, T1: 1, T2: 2, T3: 3, T4: 4 } as const)[lesson.technique],
      );
      const allowed = new Set(lesson.allowedTechs);
      expect(
        ann.techCombo.every((t) => allowed.has(t)),
        `L${level.id} techCombo ${ann.techCombo} ⊆ ${lesson.allowedTechs}`,
      ).toBe(true);
    }
  });
});
