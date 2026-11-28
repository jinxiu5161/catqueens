import type { SaveDataV1 } from '../save/SaveTypes';
import { ticketService } from './TicketService';

export interface AchievementDef {
  id: string;
  category: 'progress' | 'skill' | 'collection' | 'challenge';
  counter?: string;
  threshold?: number;
  ticketReward?: number;
  nameKey: string;
}

/** Starter subset; full 36 entries live in achievements.json. */
export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'clear_10', category: 'progress', counter: 'clears', threshold: 10, ticketReward: 1, nameKey: 'ach.clear_10' },
  { id: 'clear_50', category: 'progress', counter: 'clears', threshold: 50, ticketReward: 2, nameKey: 'ach.clear_50' },
  { id: 'clear_100', category: 'progress', counter: 'clears', threshold: 100, ticketReward: 2, nameKey: 'ach.clear_100' },
  { id: 'no_hint_10', category: 'skill', counter: 'noHintClears', threshold: 10, ticketReward: 1, nameKey: 'ach.no_hint_10' },
  { id: 'cats_10', category: 'collection', counter: 'catsUnlocked', threshold: 10, ticketReward: 1, nameKey: 'ach.cats_10' },
];

export class AchievementService {
  private defs: AchievementDef[];

  constructor(defs: AchievementDef[] = ACHIEVEMENTS) {
    this.defs = defs;
  }

  syncCounters(save: SaveDataV1): void {
    save.achievements.counters.clears = save.stats.clears;
    save.achievements.counters.catsUnlocked = save.collection.unlockedCatIds.length;
  }

  evaluate(save: SaveDataV1): string[] {
    this.syncCounters(save);
    const unlocked: string[] = [];
    for (const def of this.defs) {
      if (save.achievements.unlockedIds.includes(def.id)) continue;
      if (def.id.includes('streak') || def.id.includes('daily')) continue;
      const value = def.counter ? (save.achievements.counters[def.counter] ?? 0) : 0;
      if (def.threshold != null && value >= def.threshold) {
        save.achievements.unlockedIds.push(def.id);
        if (def.ticketReward && !save.economy.rewardedAchievementIds.includes(def.id)) {
          save.economy.rewardedAchievementIds.push(def.id);
          ticketService.grant(save, def.ticketReward, 'achievement');
        }
        unlocked.push(def.id);
      }
    }
    return unlocked;
  }
}

export const achievementService = new AchievementService();
