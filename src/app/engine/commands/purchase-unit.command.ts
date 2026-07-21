import { Command, CommandResult } from '../../interfaces/command';
import { GameState } from '../../models/game-state.model';
import { GameEngineEvent } from '../../interfaces/game-events';
import { ReserveEntry, UnitDefinition } from '../../models/unit.model';
import { RulesEngine } from '../rules-engine';

/**
 * Spends treasury on units, which enter the player's Reserve
 * (PROJECT_RULES.md sections 5, 25, 26). Money can never go negative:
 * any invalid purchase is rejected with an event and leaves state untouched.
 */
export class PurchaseUnitCommand implements Command {
  readonly type = 'PurchaseUnit';

  constructor(
    private readonly playerId: string,
    private readonly unitId: string,
    private readonly quantity: number,
    private readonly unitCatalog: Readonly<Record<string, UnitDefinition>>,
    private readonly rules: RulesEngine = new RulesEngine(),
  ) {}

  execute(state: GameState): CommandResult {
    const reject = (reason: string): CommandResult => ({
      state,
      events: [{ type: 'PurchaseRejected', playerId: this.playerId, reason }],
    });

    if (state.phase !== 'buyUnits') {
      return reject('Purchases are only allowed during the Buy Units phase');
    }

    if (state.activePlayerId !== this.playerId) {
      return reject('It is not your turn');
    }

    const player = this.rules.getPlayer(state, this.playerId);
    if (!player) {
      return reject(`Unknown player "${this.playerId}"`);
    }

    if (!Number.isInteger(this.quantity) || this.quantity <= 0) {
      return reject('Quantity must be a positive whole number');
    }

    const unit = this.unitCatalog[this.unitId];
    if (!unit) {
      return reject(`Unknown unit "${this.unitId}"`);
    }

    const totalCost = unit.cost * this.quantity;
    if (totalCost > player.treasury) {
      return reject(`Insufficient treasury: ${totalCost} needed, ${player.treasury} available`);
    }

    const nextPlayers = state.players.map((candidate) => {
      if (candidate.id !== this.playerId) {
        return candidate;
      }
      return {
        ...candidate,
        treasury: candidate.treasury - totalCost,
        reserve: mergeReserve(candidate.reserve, this.unitId, this.quantity),
      };
    });

    const events: readonly GameEngineEvent[] = [
      { type: 'UnitPurchased', playerId: this.playerId, unitId: this.unitId, quantity: this.quantity },
    ];
    return { state: { ...state, players: nextPlayers }, events };
  }
}

function mergeReserve(
  reserve: readonly ReserveEntry[],
  unitId: string,
  quantity: number,
): readonly ReserveEntry[] {
  const existing = reserve.find((entry) => entry.unitId === unitId);
  if (!existing) {
    return [...reserve, { unitId, quantity }];
  }
  return reserve.map((entry) =>
    entry.unitId === unitId ? { ...entry, quantity: entry.quantity + quantity } : entry,
  );
}
