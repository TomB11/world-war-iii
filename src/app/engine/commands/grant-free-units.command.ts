import { Command, CommandResult } from '../../interfaces/command';
import { GameState } from '../../models/game-state.model';
import { GameEngineEvent } from '../../interfaces/game-events';
import { RulesEngine } from '../rules-engine';
import { mergeReserve } from './shared/reserve.util';

/**
 * Solo Command Mode: adds units directly to a player's Reserve with no
 * cost — the rulebook's Threat Track "place 2 free infantry on the front"
 * bonus. Deliberately adds to Reserve rather than placing directly on the
 * map: the very next Place New Units phase this same turn deploys them
 * through the normal DeployUnitCommand flow, so factory-capacity and
 * captured-this-turn checks apply exactly as they would to any other unit —
 * no separate map-placement bypass logic needed.
 */
export class GrantFreeUnitsCommand implements Command {
  readonly type = 'GrantFreeUnits';

  constructor(
    private readonly playerId: string,
    private readonly unitId: string,
    private readonly quantity: number,
    private readonly rules: RulesEngine = new RulesEngine(),
  ) {}

  execute(state: GameState): CommandResult {
    const player = this.rules.getPlayer(state, this.playerId);
    if (!player || this.quantity <= 0) {
      return { state, events: [] };
    }

    const nextPlayers = state.players.map((candidate) =>
      candidate.id === this.playerId
        ? { ...candidate, reserve: mergeReserve(candidate.reserve, this.unitId, this.quantity) }
        : candidate,
    );

    const events: readonly GameEngineEvent[] = [
      { type: 'FreeUnitsGranted', playerId: this.playerId, unitId: this.unitId, quantity: this.quantity },
    ];
    return { state: { ...state, players: nextPlayers }, events };
  }
}
