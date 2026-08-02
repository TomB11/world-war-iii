import { Command, CommandResult } from '../../interfaces/command';
import { GameState } from '../../models/game-state.model';
import { GameEngineEvent } from '../../interfaces/game-events';
import { RulesEngine } from '../rules-engine';

/**
 * Solo Command Mode: credits treasury with no cost/side-effect, for one-time
 * Threat Track bonuses or difficulty presets — kept as its own tiny command
 * (rather than an `isFree` flag threaded through PurchaseUnitCommand or
 * similar) so "free" bonuses never need to special-case an existing
 * cost-charging command.
 */
export class GrantFreeTreasuryCommand implements Command {
  readonly type = 'GrantFreeTreasury';

  constructor(
    private readonly playerId: string,
    private readonly amount: number,
    private readonly reason: string,
    private readonly rules: RulesEngine = new RulesEngine(),
  ) {}

  execute(state: GameState): CommandResult {
    const player = this.rules.getPlayer(state, this.playerId);
    if (!player || this.amount === 0) {
      return { state, events: [] };
    }

    const nextPlayers = state.players.map((candidate) =>
      candidate.id === this.playerId ? { ...candidate, treasury: candidate.treasury + this.amount } : candidate,
    );

    const events: readonly GameEngineEvent[] = [
      { type: 'TreasuryGranted', playerId: this.playerId, amount: this.amount, reason: this.reason },
    ];
    return { state: { ...state, players: nextPlayers }, events };
  }
}
