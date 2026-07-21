import { Command, CommandResult } from '../../interfaces/command';
import { GameState } from '../../models/game-state.model';
import { GameEngineEvent } from '../../interfaces/game-events';
import { EconomyConfig } from '../../models/economy-config.model';
import { RulesEngine } from '../rules-engine';
import { rollDie } from '../random';

const DICE_SIDES = 6;

/**
 * Hacking (PROJECT_RULES.md section 6): during the Cyber Attack Phase,
 * spend economyConfig.cyberAttackCost (flat, regardless of outcome) to
 * roll a d6 against the target player's Hack Level. On a roll <= their
 * Hack Level, the hack succeeds: the target rolls a d6 too, and that many
 * money transfers from their treasury to the attacker's (clamped to what
 * the target actually has).
 */
export class HackCommand implements Command {
  readonly type = 'Hack';

  constructor(
    private readonly playerId: string,
    private readonly targetPlayerId: string,
    private readonly economyConfig: EconomyConfig,
    private readonly rules: RulesEngine = new RulesEngine(),
  ) {}

  execute(state: GameState): CommandResult {
    const reject = (reason: string): CommandResult => ({
      state,
      events: [{ type: 'CyberAttackRejected', playerId: this.playerId, reason }],
    });

    if (state.phase !== 'cyberAttack') {
      return reject('Hacking is only allowed during the Cyber Attack Phase');
    }
    if (state.activePlayerId !== this.playerId) {
      return reject('It is not your turn');
    }
    if (this.targetPlayerId === this.playerId) {
      return reject('You cannot hack yourself');
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
    if (attacker.treasury < this.economyConfig.cyberAttackCost) {
      return reject(`Not enough treasury (have ${attacker.treasury}, need ${this.economyConfig.cyberAttackCost})`);
    }

    const attackRoll = rollDie(state.randomSeed, DICE_SIDES);
    const succeeded = attackRoll.result <= target.hackLevel;

    let moneyStolen = 0;
    let nextSeed = attackRoll.nextSeed;
    if (succeeded) {
      const defenseRoll = rollDie(nextSeed, DICE_SIDES);
      nextSeed = defenseRoll.nextSeed;
      moneyStolen = Math.min(defenseRoll.result, target.treasury);
    }

    const cost = this.economyConfig.cyberAttackCost;
    const nextPlayers = state.players.map((candidate) => {
      if (candidate.id === this.playerId) {
        return {
          ...candidate,
          treasury: candidate.treasury - cost + moneyStolen,
          hasUsedCyberAttackThisTurn: true,
        };
      }
      if (candidate.id === this.targetPlayerId) {
        return { ...candidate, treasury: candidate.treasury - moneyStolen };
      }
      return candidate;
    });

    const events: readonly GameEngineEvent[] = [
      {
        type: 'HackResolved',
        playerId: this.playerId,
        targetPlayerId: this.targetPlayerId,
        attackRoll: attackRoll.result,
        succeeded,
        moneyStolen,
      },
    ];
    return { state: { ...state, players: nextPlayers, randomSeed: nextSeed }, events };
  }
}
