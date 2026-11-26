import type { CellState } from '../puzzle/PuzzleTypes';
import { GameConfig } from '../meta/GameConfig';

export interface SaveDataV1 {
  schemaVersion: 1;
  progress: {
    maxUnlockedLevel: number;
    clearedLevelIds: number[];
    currentLevelId: number;
  };
  currentRun?: {
    levelId: number;
    cells: CellState[];
    updatedAt: number;
    hearts?: number;
    revivesUsed?: number;
  };
  economy: {
    tickets: number;
    pendingTicketRewards: number;
    rewardedLevelMilestones: number[];
    rewardedAchievementIds: string[];
    /** Current stamina (lives for starting / failing levels). */
    stamina: number;
    staminaMax: number;
  };
  collection: {
    unlockedCatIds: string[];
    unlockedSkinIds: string[];
    equippedSkinByCat: Record<string, string>;
  };
  achievements: {
    unlockedIds: string[];
    counters: Record<string, number>;
  };
  stats: {
    clears: number;
    hintsUsed: number;
    undos: number;
    eliteFailures: number;
    totalPlaySeconds: number;
  };
  settings: {
    /** false = 严判（默认）：错放扣红心 */
    softMode: boolean;
    bgm: boolean;
    sfx: boolean;
    haptic: boolean;
    regionPatternMode: number;
    language: string;
    clickPlacesCat: boolean;
  };
  adDay?: {
    day: string;
    ticketRewarded: number;
    eliteRetryRewarded: number;
    interstitialShown: number;
  };
}

export function createDefaultSave(): SaveDataV1 {
  return {
    schemaVersion: 1,
    progress: {
      maxUnlockedLevel: 1,
      clearedLevelIds: [],
      currentLevelId: 1,
    },
    economy: {
      tickets: 2,
      pendingTicketRewards: 0,
      rewardedLevelMilestones: [],
      rewardedAchievementIds: [],
      stamina: GameConfig.staminaMax,
      staminaMax: GameConfig.staminaMax,
    },
    collection: {
      unlockedCatIds: ['cat_01'],
      unlockedSkinIds: ['skin_basic'],
      equippedSkinByCat: { cat_01: 'skin_basic' },
    },
    achievements: {
      unlockedIds: [],
      counters: {},
    },
    stats: {
      clears: 0,
      hintsUsed: 0,
      undos: 0,
      eliteFailures: 0,
      totalPlaySeconds: 0,
    },
    settings: {
      // Product update: default strict judgment
      softMode: false,
      bgm: true,
      sfx: true,
      haptic: true,
      regionPatternMode: 1,
      language: 'zh-CN',
      clickPlacesCat: false,
    },
  };
}
