import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { LevelsFile } from '../../assets/scripts/core/level/LevelDefinition';
import {
  TECHNIQUE_GUIDE_LEVEL,
  TECHNIQUE_LABELS,
  analyzeTechniques,
  coachGuideKeyForLevel,
  curriculumFor,
  techniqueGuideForLevel,
} from '../../assets/scripts/core/level/LevelTechniques';
import { annotateLevel } from '../../assets/scripts/core/level/TechSolver';

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
    expect(curriculumFor(2).technique).toBe('T1');
    expect(curriculumFor(2).guideKey).toBe('T1a');
    expect(curriculumFor(2).size).toBe(5);
    expect(curriculumFor(2).minSingles).toBeGreaterThanOrEqual(1);
    expect(curriculumFor(2).requireLinePin).toBeFalsy();
    expect(curriculumFor(3).pure).toBe(true);
    expect(curriculumFor(4).guideKey).toBe('T1b');
    expect(curriculumFor(4).size).toBe(5);
    expect(curriculumFor(5).technique).toBe('T1');
    expect(curriculumFor(8).technique).toBe('T2');
    expect(curriculumFor(8).size).toBe(5);
    expect(curriculumFor(8).maxSingles).toBe(0);
    expect(curriculumFor(16).technique).toBe('T3');
    expect(curriculumFor(51).technique).toBe('T4');
    expect(curriculumFor(121).size).toBe(7);
    expect(curriculumFor(251).size).toBe(8);
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

  it('L1 is pure T0 (requiredTech 0)', () => {
    const level = file.levels.find((l) => l.id === 1)!;
    const ann = annotateLevel(level);
    expect(ann.requiredTech).toBe(0);
    expect(ann.solved).toBe(true);
    expect(level.requiredTech).toBe(0);
  });

  it('L2 T1a guide uses prePlaceCats and requiredTech 1', () => {
    const level = file.levels.find((l) => l.id === 2)!;
    expect(level.size).toBe(5);
    expect(level.prePlaceCats?.length).toBe(1);
    expect(level.requiredTech).toBe(1);
    const ann = annotateLevel(level, {
      t1Mode: 'a',
      initialCats: level.prePlaceCats,
    });
    expect(ann.requiredTech).toBe(1);
    expect(ann.firstAction?.kind).toBe('T1a');
  });

  it('T3 sample has pigeonhole-2 or line-pin exclusion structure', () => {
    const level = file.levels.find((l) => l.id === 16)!;
    if (!level) return;
    const flags = analyzeTechniques(level);
    expect(flags.hasPigeonhole2 || flags.hasLinePin).toBe(true);
  });
});
