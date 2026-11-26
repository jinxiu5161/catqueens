import type { CellState } from '../puzzle/PuzzleTypes';

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
  };
  economy: {
    tickets: number;
    pendingTicketRewards: number;
    rewardedLevelMilestones: number[];
    rewardedAchievementIds: string[];
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
    softMode: boolean;
    bgm: boolean;
    sfx: boolean;
    haptic: boolean;
    regionPatternMode: number;
    language: string;
    clickPlacesCat: boolean;
  };
  /** Ad frequency counters keyed by local calendar day YYYY-MM-DD */
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
      softMode: true,
      bgm: true,
      sfx: true,
      haptic: true,
      regionPatternMode: 1,
      language: 'zh-CN',
      clickPlacesCat: false,
    },
  };
}
