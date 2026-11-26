import { PENDING_TICKET_CAP } from '../save/SaveService';
import type { SaveDataV1 } from '../save/SaveTypes';

const TICKET_CAP = 9;

export class TicketService {
  canUse(save: SaveDataV1): boolean {
    return save.economy.tickets > 0;
  }

  consume(save: SaveDataV1): boolean {
    if (save.economy.tickets <= 0) return false;
    save.economy.tickets -= 1;
    this.claimPendingIfPossible(save);
    return true;
  }

  grant(save: SaveDataV1, amount: number, _source: string): void {
    let remaining = amount;
    while (remaining > 0) {
      if (save.economy.tickets < TICKET_CAP) {
        save.economy.tickets += 1;
      } else if (save.economy.pendingTicketRewards < PENDING_TICKET_CAP) {
        save.economy.pendingTicketRewards += 1;
      }
      remaining -= 1;
    }
  }

  grantMilestoneIfNeeded(save: SaveDataV1, clearedLevelId: number): void {
    if (clearedLevelId % 10 !== 0) return;
    if (save.economy.rewardedLevelMilestones.includes(clearedLevelId)) return;
    save.economy.rewardedLevelMilestones.push(clearedLevelId);
    this.grant(save, 1, 'level');
  }

  claimPendingIfPossible(save: SaveDataV1): void {
    while (save.economy.pendingTicketRewards > 0 && save.economy.tickets < TICKET_CAP) {
      save.economy.pendingTicketRewards -= 1;
      save.economy.tickets += 1;
    }
  }
}

export const ticketService = new TicketService();
