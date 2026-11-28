/**
 * Post-check: every level must annotate under lesson.allowedTechs with
 * solved && requiredTech === primary && techCombo ⊆ allowed.
 * Run: npx tsx scripts/postcheck-allowed-techs.ts
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { LevelDefinition } from '../assets/scripts/core/puzzle/PuzzleTypes';
import { curriculumFor } from '../assets/scripts/core/level/LevelTechniques';
import { annotateLevel, type TechId } from '../assets/scripts/core/level/TechSolver';
import { singletonSolutionCats } from '../assets/scripts/core/level/TechniqueCoach';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function techNum(technique: string): number {
  return ({ T0: 0, T1: 1, T2: 2, T3: 3, T4: 4 } as Record<string, number>)[technique] ?? -1;
}

function main(): void {
  const file = JSON.parse(
    readFileSync(join(ROOT, 'assets/resources/data/levels.json'), 'utf8'),
  ) as { levels: LevelDefinition[] };

  const bad: Array<{ id: number; reason: string; combo?: number[] }> = [];
  for (const level of file.levels) {
    const lesson = curriculumFor(level.id);
    const opts: {
      allowedTechs: TechId[];
      pigeonK: 2;
      t1Mode?: 'full' | 'a' | 'b';
      initialCats?: number[];
    } = {
      allowedTechs: lesson.allowedTechs.slice() as TechId[],
      pigeonK: 2,
    };
    if (lesson.technique === 'T1') {
      const cat = level.prePlaceCats?.[0] ?? singletonSolutionCats(level)[0];
      opts.t1Mode =
        lesson.guideKey === 'T1a' ? 'a' : lesson.guideKey === 'T1b' ? 'b' : 'full';
      if (cat != null) opts.initialCats = [cat];
    }
    const ann = annotateLevel(level, opts);
    if (!ann.solved) {
      bad.push({ id: level.id, reason: 'unsolved', combo: ann.techCombo });
      continue;
    }
    if (ann.requiredTech !== techNum(lesson.technique)) {
      bad.push({
        id: level.id,
        reason: `requiredTech ${ann.requiredTech} !== ${techNum(lesson.technique)}`,
        combo: ann.techCombo,
      });
      continue;
    }
    const allowed = new Set(lesson.allowedTechs);
    if (!ann.techCombo.every((t) => allowed.has(t))) {
      bad.push({
        id: level.id,
        reason: `techCombo ⊈ allowed ${lesson.allowedTechs.join(',')}`,
        combo: ann.techCombo,
      });
    }
  }

  console.log(
    JSON.stringify(
      {
        total: file.levels.length,
        badCount: bad.length,
        bad: bad.slice(0, 40),
        l1: (() => {
          const l = file.levels.find((x) => x.id === 1);
          if (!l) return null;
          const lesson = curriculumFor(1);
          const ann = annotateLevel(l, {
            allowedTechs: lesson.allowedTechs as TechId[],
            pigeonK: 2,
          });
          return {
            techCombo: ann.techCombo,
            requiredTech: ann.requiredTech,
            solved: ann.solved,
            firstAction: ann.firstAction?.kind,
          };
        })(),
        l2: (() => {
          const l = file.levels.find((x) => x.id === 2);
          if (!l) return null;
          const lesson = curriculumFor(2);
          const ann = annotateLevel(l, {
            allowedTechs: lesson.allowedTechs as TechId[],
            pigeonK: 2,
            t1Mode: 'a',
            initialCats: l.prePlaceCats,
          });
          return {
            techCombo: ann.techCombo,
            requiredTech: ann.requiredTech,
            solved: ann.solved,
            firstAction: ann.firstAction?.kind,
          };
        })(),
      },
      null,
      2,
    ),
  );
  if (bad.length) process.exit(1);
}

main();
