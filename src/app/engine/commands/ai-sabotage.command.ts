import { Command, CommandResult } from '../../interfaces/command';
import { GameState } from '../../models/game-state.model';
import { GameEngineEvent } from '../../interfaces/game-events';
import { EconomyConfig } from '../../models/economy-config.model';
import { AiSabotageEffectsData } from '../../models/ai-sabotage.model';
import { RulesEngine } from '../rules-engine';
import { rollDie } from '../random';
import { DICE_SIDES } from '../constants/dice.constants';
import { clamp } from '../../core/utils/math.util';

/**
 * Solo Command Mode's "Sabotage" (rulebook section 6): rolls 1d6 against
 * sabotageEffects.effects to pick one of three effects on the target
 * (chosen by the caller — services/ai-turn.service.ts picks the richest
 * enemy region's owner via AiDecisionEngine.pickRichestEnemyRegion):
 * a flat treasury loss, blocking one region's factory for its owner's next
 * Place New Units phase (GameState.sabotagedRegionIds — see
 * DeployUnitCommand and AdvancePhaseCommand), or a Citizen Satisfaction
 * drop. No cost to the saboteur — this is a Cyber Attack Phase action, so
 * it sets hasUsedCyberAttackThisTurn on the acting player just like
 * Hack/Political Influence, sharing the same once-per-turn slot.
 */
export class AiSabotageCommand implements Command {
  readonly type = 'AiSabotage';

  constructor(
    private readonly playerId: string,
    private readonly targetPlayerId: string,
    private readonly targetRegionId: string,
    private readonly economyConfig: EconomyConfig,
    private readonly sabotageEffects: AiSabotageEffectsData,
    private readonly rules: RulesEngine = new RulesEngine(),
  ) {}

  execute(state: GameState): CommandResult {
    const reject = (reason: string): CommandResult => ({
      state,
      events: [{ type: 'CyberAttackRejected', playerId: this.playerId, reason }],
    });

    if (state.phase !== 'cyberAttack') {
      return reject('Sabotage is only allowed during the Cyber Attack Phase');
    }
    if (state.activePlayerId !== this.playerId) {
      return reject('It is not your turn');
    }
    if (this.playerId === this.targetPlayerId) {
      return reject('You cannot sabotage yourself');
    }
    const attacker = this.rules.getPlayer(state, this.playerId);
    if (!attacker) {
      return reject(`Unknown player "${this.playerId}"`);
    }
    if (attacker.hasUsedCyberAttackThisTurn) {
      return reject('You already used your Cyber Attack action this turn');
    }
    const target = this.rules.getPlayer(state, this.targetPlayerId);
    if (!target) {
      return reject(`Unknown target "${this.targetPlayerId}"`);
    }

    const roll = rollDie(state.randomSeed, DICE_SIDES);
    const effect = this.sabotageEffects.effects[String(roll.result)] ?? 'moneyLoss';

    let nextPlayers = state.players.map((candidate) =>
      candidate.id === this.playerId ? { ...candidate, hasUsedCyberAttackThisTurn: true } : candidate,
    );
    let nextSabotagedRegionIds = state.sabotagedRegionIds;

    switch (effect) {
      case 'moneyLoss':
        nextPlayers = nextPlayers.map((candidate) =>
          candidate.id === this.targetPlayerId
            ? { ...candidate, treasury: candidate.treasury - this.sabotageEffects.moneyLossAmount }
            : candidate,
        );
        break;
      case 'spawnBlock':
        if (!state.sabotagedRegionIds.includes(this.targetRegionId)) {
          nextSabotagedRegionIds = [...state.sabotagedRegionIds, this.targetRegionId];
        }
        break;
      case 'satisfactionDrop':
        nextPlayers = nextPlayers.map((candidate) =>
          candidate.id === this.targetPlayerId
            ? {
                ...candidate,
                citizenSatisfaction: clamp(
                  candidate.citizenSatisfaction - this.sabotageEffects.satisfactionDropAmount,
                  this.economyConfig.citizenSatisfactionMin,
                  this.economyConfig.citizenSatisfactionMax,
                ),
              }
            : candidate,
        );
        break;
    }

    const events: readonly GameEngineEvent[] = [
      {
        type: 'AiSabotageResolved',
        playerId: this.playerId,
        targetPlayerId: this.targetPlayerId,
        targetRegionId: this.targetRegionId,
        effect,
      },
    ];
    return {
      state: { ...state, randomSeed: roll.nextSeed, players: nextPlayers, sabotagedRegionIds: nextSabotagedRegionIds },
      events,
    };
  }
}
