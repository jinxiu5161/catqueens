import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { LevelsFile } from '../../assets/scripts/core/level/LevelDefinition';
import {
  TECHNIQUE_GUIDE_LEVEL,
  TECHNIQUE_LABELS,
  analyzeTechniques,
  curriculumFor,
  hasPigeonhole,
  techniqueGuideForLevel,
} from '../../assets/scripts/core/level/LevelTechniques';

const file = JSON.parse(
  readFileSync(join(process.cwd(), 'assets/resources/data/levels.json'), 'utf8'),
) as LevelsFile;

describe('technique curriculum', () => {
  it('exposes Chinese labels for T0–T6', () => {
    for (const id of Object.keys(TECHNIQUE_LABELS) as (keyof typeof TECHNIQUE_LABELS)[]) {
      expect(TECHNIQUE_LABELS[id].length).toBeGreaterThan(0);
    }
  });

  it('curriculum milestones match intended techniques', () => {
    expect(curriculumFor(1).technique).toBe('T0');
    expect(curriculumFor(5).technique).toBe('T1');
    expect(curriculumFor(13).size).toBe(5);
    expect(curriculumFor(14).size).toBe(5);
    expect(curriculumFor(30).technique).toBe('T2');
    expect(curriculumFor(55).technique).toBe('T4');
    expect(curriculumFor(110).technique).toBe('T5');
    expect(curriculumFor(300).technique).toBe('T6');
  });

  it('technique guides fire on first teach levels', () => {
    expect(techniqueGuideForLevel(5)).toBe('T1');
    expect(techniqueGuideForLevel(15)).toBe('T3');
    expect(techniqueGuideForLevel(29)).toBe('T2');
    expect(techniqueGuideForLevel(6)).toBeNull();
    expect(TECHNIQUE_GUIDE_LEVEL.T1).toBe(5);
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

  it('T1 teach level has a line-pinned region', () => {
    const level = file.levels.find((l) => l.id === 5)!;
    const flags = analyzeTechniques(level);
    expect(flags.hasLinePin).toBe(true);
  });

  it('T2 sample has pigeonhole-2 or line-pin exclusion structure', () => {
    const level = file.levels.find((l) => l.id === 30)!;
    const flags = analyzeTechniques(level);
    expect(flags.hasPigeonhole2 || flags.hasLinePin).toBe(true);
  });
});
