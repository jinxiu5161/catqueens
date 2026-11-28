import { createDefaultSave, type SaveDataV1 } from './SaveTypes';

/** Future schema bumps go here. Currently only v1. */
export function migrateSave(raw: unknown): SaveDataV1 {
  if (!raw || typeof raw !== 'object') return createDefaultSave();
  const data = raw as Partial<SaveDataV1> & { schemaVersion?: number };
  if (data.schemaVersion !== 1) return createDefaultSave();
  return data as SaveDataV1;
}
