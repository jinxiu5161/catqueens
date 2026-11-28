import type { InterstitialResult, RewardedPlacement, RewardedResult } from './PlatformService';

/** Real SDK adapter stub — replace body when ad network is chosen. */
export class AdsAdapter {
  async showRewarded(_placement: RewardedPlacement): Promise<RewardedResult> {
    return 'FAILED';
  }

  async showInterstitial(): Promise<InterstitialResult> {
    return 'FAILED';
  }
}
