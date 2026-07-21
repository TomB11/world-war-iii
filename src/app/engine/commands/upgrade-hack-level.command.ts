import { Command, CommandResult } from '../../interfaces/command';
import { GameState } from '../../models/game-state.model';
import { GameEngineEvent } from '../../interfaces/game-events';
import { EconomyConfig } from '../../models/economy-config.model';
import { RulesEngine } from '../rules-engine';

/**
 * Raise your own Hack Level (PROJECT_RULES.md section 6) by 1, for
 * economyConfig.hackLevelUpgradeCost, up to hackLevelMax. This is a Cyber
 * Attack Phase action just like Hacking/Political Influence, and shares
 * their once-per-turn slot (hasUsedCyberAttackThisTurn) — a player picks
 * exactly one Cyber Attack action per turn, not one of each.
 */
export class UpgradeHackLevelCommand implements Command {
  readonly type = 'UpgradeHackLevel';

  constructor(
    private readonly playerId: string,
    private readonly economyConfig: EconomyConfig,
    private readonly rules: RulesEngine = new RulesEngine(),
  ) {}

  execute(state: GameState): CommandResult {
    const reject = (reason: string): CommandResult => ({
      state,
      events: [{ type: 'CyberAttackRejected', playerId: this.playerId, reason }],
    });

    if (state.phase !== 'cyberAttack') {
      return reject('Upgrading Hack Level is only allowed during the Cyber Attack Phase');
    }
    if (state.activePlayerId !== this.playerId) {
      return reject('It is not your turn');
    }

    const player = this.rules.getPlayer(state, this.playerId);
    if (!player) {
      return reject(`Unknown player "${this.playerId}"`);
    }
    if (player.hasUsedCyberAttackThisTurn) {
      return reject('You already used your Cyber Attack action this turn');
    }
    if (player.hackLevel >= this.economyConfig.hackLevelMax) {
      return reject(`Hack Level is already at its maximum (${this.economyConfig.hackLevelMax})`);
    }
    if (player.treasury < this.economyConfig.hackLevelUpgradeCost) {
      return reject(
        `Not enough treasury (have ${player.treasury}, need ${this.economyConfig.hackLevelUpgradeCost})`,
      );
    }

    const nextHackLevel = player.hackLevel + 1;
    const nextPlayers = state.players.map((candidate) =>
      candidate.id === this.playerId
        ? {
            ...candidate,
            treasury: candidate.treasury - this.economyConfig.hackLevelUpgradeCost,
            hackLevel: nextHackLevel,
            hasUsedCyberAttackThisTurn: true,
          }
        : candidate,
    );

    const events: readonly GameEngineEvent[] = [
      { type: 'HackLevelUpgraded', playerId: this.playerId, hackLevel: nextHackLevel },
    ];
    return { state: { ...state, players: nextPlayers }, events };
  }
}
