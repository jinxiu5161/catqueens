import { createDefaultSave, type SaveDataV1 } from './SaveTypes';
import type { StorageAdapter } from './StorageAdapter';
import { MemoryStorageAdapter } from './StorageAdapter';

const STORAGE_KEY = 'catqueens.save.v1';
const BACKUP_KEY = 'catqueens.save.v1.bak';
export const PENDING_TICKET_CAP = 30;

export class SaveService {
  constructor(private storage: StorageAdapter = new MemoryStorageAdapter()) {}

  setStorage(storage: StorageAdapter): void {
    this.storage = storage;
  }

  load(): SaveDataV1 {
    try {
      const raw = this.storage.getItem(STORAGE_KEY);
      if (!raw) return createDefaultSave();
      return this.migrate(JSON.parse(raw) as SaveDataV1);
    } catch {
      try {
        const bak = this.storage.getItem(BACKUP_KEY);
        if (bak) return this.migrate(JSON.parse(bak) as SaveDataV1);
      } catch {
        /* ignore */
      }
      return createDefaultSave();
    }
  }

  save(data: SaveDataV1): void {
    const normalized = this.normalize(data);
    const json = JSON.stringify(normalized);
    try {
      const prev = this.storage.getItem(STORAGE_KEY);
      if (prev) this.storage.setItem(BACKUP_KEY, prev);
      this.storage.setItem(STORAGE_KEY, json);
    } catch {
      /* quota / sandbox */
    }
  }

  migrate(data: SaveDataV1): SaveDataV1 {
    if (!data || (data as { schemaVersion?: number }).schemaVersion !== 1) {
      return createDefaultSave();
    }
    const base = createDefaultSave();
    return this.normalize({
      ...base,
      ...data,
      schemaVersion: 1,
      progress: { ...base.progress, ...data.progress },
      economy: { ...base.economy, ...data.economy },
      collection: { ...base.collection, ...data.collection },
      achievements: { ...base.achievements, ...data.achievements },
      stats: { ...base.stats, ...data.stats },
      settings: { ...base.settings, ...data.settings },
    });
  }

  normalize(data: SaveDataV1): SaveDataV1 {
    const next: SaveDataV1 = JSON.parse(JSON.stringify(data)) as SaveDataV1;
    if (!Array.isArray(next.progress.seenTechniqueGuides)) {
      next.progress.seenTechniqueGuides = [];
    } else {
      next.progress.seenTechniqueGuides = [
        ...new Set(next.progress.seenTechniqueGuides.filter((x) => typeof x === 'string')),
      ];
    }
    next.economy.tickets = Math.max(0, Math.min(9, next.economy.tickets | 0));
    next.economy.pendingTicketRewards = Math.max(
      0,
      Math.min(PENDING_TICKET_CAP, next.economy.pendingTicketRewards | 0),
    );
    const staminaMax = Math.max(1, next.economy.staminaMax | 0);
    next.economy.staminaMax = staminaMax;
    next.economy.stamina = Math.max(0, Math.min(staminaMax, next.economy.stamina | 0));
    if (next.currentRun) {
      next.currentRun.cells = next.currentRun.cells.map((c) =>
        c === 'EMPTY' || c === 'EXCLUDED' || c === 'CAT' ? c : 'EMPTY',
      );
    }
    return next;
  }
}

export const saveService = new SaveService();
