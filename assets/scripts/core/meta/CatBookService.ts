import type { SaveDataV1 } from '../save/SaveTypes';

export interface CatDefinition {
  id: string;
  nameKey: string;
  descriptionKey: string;
  unlockType: 'LEVEL_MILESTONE' | 'ACHIEVEMENT' | 'IAP';
  unlockValue: string | number;
  skinIds: string[];
}

export function buildDefaultCats(): CatDefinition[] {
  return Array.from({ length: 50 }, (_, i) => {
    const n = i + 1;
    const id = `cat_${String(n).padStart(2, '0')}`;
    return {
      id,
      nameKey: `cat.${id}.name`,
      descriptionKey: `cat.${id}.desc`,
      unlockType: 'LEVEL_MILESTONE' as const,
      unlockValue: n === 1 ? 1 : Math.min(500, n * 10),
      skinIds: ['skin_basic'],
    };
  });
}

export const CATS = buildDefaultCats();

export class CatBookService {
  constructor(private cats: CatDefinition[] = CATS) {}

  syncUnlocks(save: SaveDataV1): string[] {
    const newly: string[] = [];
    const maxCleared = save.progress.clearedLevelIds.reduce((m, id) => Math.max(m, id), 0);
    for (const cat of this.cats) {
      if (save.collection.unlockedCatIds.includes(cat.id)) continue;
      if (cat.unlockType === 'LEVEL_MILESTONE' && maxCleared >= Number(cat.unlockValue)) {
        save.collection.unlockedCatIds.push(cat.id);
        newly.push(cat.id);
      }
    }
    return newly;
  }

  list(): CatDefinition[] {
    return this.cats;
  }
}

export const catBookService = new CatBookService();
