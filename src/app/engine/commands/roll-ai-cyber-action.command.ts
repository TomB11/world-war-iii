import { Command, CommandResult } from '../../interfaces/command';
import { GameState } from '../../models/game-state.model';
import { GameEngineEvent } from '../../interfaces/game-events';
import { AiCyberActionTableData } from '../../models/ai-cyber-action.model';
import { RulesEngine } from '../rules-engine';
import { rollDie } from '../random';
import { DICE_SIDES } from '../constants/dice.constants';

/**
 * Solo Command Mode's "Cyber & Political Actions" roll (rulebook section 6):
 * rolls 1d6 during the AI's Cyber Attack Phase to decide none/hack/influence/
 * sabotage. The caller (services/ai-turn.service.ts) reads the result back
 * via GameStore.lastAiCyberAction() and dispatches the matching existing
 * command (hack/politicalInfluence) — this command only decides *what*.
 */
export class RollAiCyberActionCommand implements Command {
  readonly type = 'RollAiCyberAction';

  constructor(
    private readonly playerId: string,
    private readonly cyberActionTable: AiCyberActionTableData,
    private readonly rules: RulesEngine = new RulesEngine(),
  ) {}

  execute(state: GameState): CommandResult {
    if (state.activePlayerId !== this.playerId || state.phase !== 'cyberAttack') {
      return { state, events: [] };
    }

    const roll = rollDie(state.randomSeed, DICE_SIDES);
    const action = this.cyberActionTable.table[String(roll.result)] ?? 'none';

    const events: readonly GameEngineEvent[] = [
      { type: 'AiCyberActionRolled', playerId: this.playerId, roll: roll.result, action },
    ];
    return { state: { ...state, randomSeed: roll.nextSeed }, events };
  }
}
