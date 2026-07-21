import { Command, CommandResult } from '../../interfaces/command';
import { GameState } from '../../models/game-state.model';
import { GameEngineEvent } from '../../interfaces/game-events';
import { EconomyConfig } from '../../models/economy-config.model';
import { RulesEngine } from '../rules-engine';
import { rollDie } from '../random';

const DICE_SIDES = 6;

/**
 * Political Influence (PROJECT_RULES.md section 6): during the Cyber
 * Attack Phase, spend economyConfig.cyberAttackCost (flat, regardless of
 * outcome) to roll a d6 against politicalInfluenceThreshold on a neutral
 * region. Success places one influence token there for the attacker; once
 * they lead every rival faction's token count there by
 * politicalInfluenceMajority or more, the region becomes theirs —
 * peacefully, so unlike AttackCommand this never touches Citizen
 * Satisfaction. Any units already sitting in that region (a neutral
 * garrison) defect to the new owner.
 */
export class PoliticalInfluenceCommand implements Command {
  readonly type = 'PoliticalInfluence';

  constructor(
    private readonly playerId: string,
    private readonly targetRegionId: string,
    private readonly economyConfig: EconomyConfig,
    private readonly rules: RulesEngine = new RulesEngine(),
  ) {}

  execute(state: GameState): CommandResult {
    const reject = (reason: string): CommandResult => ({
      state,
      events: [{ type: 'CyberAttackRejected', playerId: this.playerId, reason }],
    });

    if (state.phase !== 'cyberAttack') {
      return reject('Political Influence is only allowed during the Cyber Attack Phase');
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
    if (player.treasury < this.economyConfig.cyberAttackCost) {
      return reject(`Not enough treasury (have ${player.treasury}, need ${this.economyConfig.cyberAttackCost})`);
    }

    const region = state.regions[this.targetRegionId];
    if (!region) {
      return reject(`Unknown region "${this.targetRegionId}"`);
    }
    if (region.ownerId !== null) {
      return reject(`${region.name} is not neutral — Political Influence only targets neutral regions`);
    }

    const roll = rollDie(state.randomSeed, DICE_SIDES);
    const succeeded = roll.result <= this.economyConfig.politicalInfluenceThreshold;

    const cost = this.economyConfig.cyberAttackCost;
    const nextPlayers = state.players.map((candidate) =>
      candidate.id === this.playerId
        ? { ...candidate, treasury: candidate.treasury - cost, hasUsedCyberAttackThisTurn: true }
        : candidate,
    );

    let nextRegions = state.regions;
    let nextUnits = state.units;
    let capturedRegion = false;

    if (succeeded) {
      const currentTokens = region.influenceTokens ?? {};
      const updatedTokens = { ...currentTokens, [this.playerId]: (currentTokens[this.playerId] ?? 0) + 1 };
      const rivalMax = Math.max(
        0,
        ...Object.entries(updatedTokens)
          .filter(([factionId]) => factionId !== this.playerId)
          .map(([, count]) => count),
      );
      capturedRegion = updatedTokens[this.playerId] - rivalMax >= this.economyConfig.politicalInfluenceMajority;

      nextRegions = {
        ...state.regions,
        [this.targetRegionId]: {
          ...region,
          influenceTokens: updatedTokens,
          ownerId: capturedRegion ? this.playerId : region.ownerId,
        },
      };

      if (capturedRegion) {
        nextUnits = state.units.map((unit) =>
          unit.regionId === this.targetRegionId ? { ...unit, ownerId: this.playerId } : unit,
        );
      }
    }

    const events: readonly GameEngineEvent[] = [
      {
        type: 'PoliticalInfluenceResolved',
        playerId: this.playerId,
        regionId: this.targetRegionId,
        roll: roll.result,
        succeeded,
        capturedRegion,
      },
    ];
    return {
      state: { ...state, players: nextPlayers, regions: nextRegions, units: nextUnits, randomSeed: roll.nextSeed },
      events,
    };
  }
}
