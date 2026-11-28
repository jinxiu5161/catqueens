export type RewardedPlacement = 'TICKET' | 'ELITE_RETRY';
export type RewardedResult = 'COMPLETED' | 'CANCELLED' | 'FAILED';
export type InterstitialResult = 'SHOWN' | 'SKIPPED' | 'FAILED';

export interface PurchaseResult {
  productId: string;
  ok: boolean;
  reason?: string;
}

export interface PlatformService {
  initialize(): Promise<void>;
  showRewarded(placement: RewardedPlacement): Promise<RewardedResult>;
  showInterstitial(): Promise<InterstitialResult>;
  purchase(productId: string): Promise<PurchaseResult>;
  restorePurchases(): Promise<PurchaseResult[]>;
  submitAchievement(id: string): Promise<void>;
  submitLeaderboard(id: string, value: number): Promise<void>;
}

/** Dev / offline mock — never blocks core gameplay. */
export class MockPlatformAdapter implements PlatformService {
  async initialize(): Promise<void> {
    /* no-op */
  }

  async showRewarded(_placement: RewardedPlacement): Promise<RewardedResult> {
    return 'COMPLETED';
  }

  async showInterstitial(): Promise<InterstitialResult> {
    return 'SKIPPED';
  }

  async purchase(productId: string): Promise<PurchaseResult> {
    return { productId, ok: true };
  }

  async restorePurchases(): Promise<PurchaseResult[]> {
    return [];
  }

  async submitAchievement(_id: string): Promise<void> {
    /* no-op */
  }

  async submitLeaderboard(_id: string, _value: number): Promise<void> {
    /* no-op */
  }
}

export const platformService: PlatformService = new MockPlatformAdapter();
