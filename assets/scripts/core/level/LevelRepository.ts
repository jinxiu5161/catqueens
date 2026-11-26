import type { LevelDefinition } from '../puzzle/PuzzleTypes';
import { puzzleValidator } from '../puzzle/PuzzleValidator';
import type { LevelsFile } from './LevelDefinition';

export interface LevelLoadReport {
  id: number;
  ok: boolean;
  errors: string[];
}

export class LevelRepository {
  private levels = new Map<number, LevelDefinition>();
  private order: number[] = [];
  schemaVersion = 1;

  load(file: LevelsFile): LevelLoadReport[] {
    if (file.schemaVersion !== 1) {
      throw new Error(`Unsupported levels schemaVersion: ${file.schemaVersion}`);
    }
    this.schemaVersion = file.schemaVersion;
    this.levels.clear();
    this.order = [];
    const reports: LevelLoadReport[] = [];

    for (const level of file.levels) {
      const result = puzzleValidator.validateLevel(level);
      const report: LevelLoadReport = { id: level.id, ok: result.ok, errors: [...result.errors] };
      if (result.ok && this.levels.has(level.id)) {
        report.ok = false;
        report.errors.push('E_ID_DUPLICATE');
      }
      reports.push(report);
      if (!report.ok) continue;
      this.levels.set(level.id, level);
      this.order.push(level.id);
    }
    this.order.sort((a, b) => a - b);
    return reports;
  }

  getById(id: number): LevelDefinition | undefined {
    return this.levels.get(id);
  }

  listIds(): number[] {
    return [...this.order];
  }

  count(): number {
    return this.order.length;
  }

  nextId(currentId: number): number | undefined {
    const idx = this.order.indexOf(currentId);
    if (idx < 0 || idx + 1 >= this.order.length) return undefined;
    return this.order[idx + 1];
  }
}
