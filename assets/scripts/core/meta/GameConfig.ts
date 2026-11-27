/** Runtime gameplay tuning — hearts / stamina / revive. */
export const GameConfig = {
  /** Red hearts at the start of each level attempt. */
  heartsPerLevel: 2,
  /** Max rewarded-ad revives per level attempt. */
  maxRevivesPerLevel: 2,
  /** Hearts restored after a successful revive ad. */
  heartsAfterRevive: 2,
  /** Stamina pool. */
  staminaMax: 5,
  /** Stamina consumed when hearts run out and player does not revive. */
  staminaCostOnFail: 1,
} as const;
