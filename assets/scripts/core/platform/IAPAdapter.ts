import type { PurchaseResult } from './PlatformService';

/** Real IAP adapter stub — wire StoreKit / Play Billing later. */
export class IAPAdapter {
  async purchase(productId: string): Promise<PurchaseResult> {
    return { productId, ok: false, reason: 'NOT_WIRED' };
  }

  async restore(): Promise<PurchaseResult[]> {
    return [];
  }
}
