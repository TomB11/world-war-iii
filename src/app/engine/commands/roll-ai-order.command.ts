import { Command, CommandResult } from '../../interfaces/command';
import { GameState } from '../../models/game-state.model';
import { GameEngineEvent } from '../../interfaces/game-events';
import { AiOrderTableData } from '../../models/ai-order.model';
import { RulesEngine } from '../rules-engine';
import { rollDie } from '../random';
import { DICE_SIDES } from '../constants/dice.constants';

/**
 * Solo Command Mode's "Determine AI Order": rolls 1d6 once at the start of
 * the AI's Buy Units phase to decide this turn's primary intent (attack
 * nearest/richest/weakest enemy region, reinforce, pressure a neutral, or a
 * doctrine special action). The caller (services/ai-turn.service.ts) reads
 * the resulting action back via GameStore.lastAiOrderAction() and acts on it
 * later in the same turn (mainly during Attack Moves).
 */
export class RollAiOrderCommand implements Command {
  readonly type = 'RollAiOrder';

  constructor(
    private readonly playerId: string,
    private readonly orderTable: AiOrderTableData,
    private readonly rules: RulesEngine = new RulesEngine(),
  ) {}

  execute(state: GameState): CommandResult {
    if (state.activePlayerId !== this.playerId || state.phase !== 'buyUnits') {
      return { state, events: [] };
    }

    const roll = rollDie(state.randomSeed, DICE_SIDES);
    const action = this.orderTable.table[String(roll.result)];
    if (!action) {
      return { state: { ...state, randomSeed: roll.nextSeed }, events: [] };
    }

    const events: readonly GameEngineEvent[] = [
      { type: 'AiOrderRolled', playerId: this.playerId, roll: roll.result, action },
    ];
    return { state: { ...state, randomSeed: roll.nextSeed }, events };
  }
}
