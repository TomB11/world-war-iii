import { Command, CommandResult } from '../../interfaces/command';
import { GameState } from '../../models/game-state.model';
import { PlayerState } from '../../models/player.model';
import { UnitInstance } from '../../models/unit-instance.model';
import { UnitDefinition } from '../../models/unit.model';
import { Faction } from '../../models/faction.model';
import { EconomyConfig, CitizenSatisfactionZone } from '../../models/economy-config.model';
import { GameEngineEvent } from '../../interfaces/game-events';
import { RulesEngine } from '../rules-engine';
import { clamp } from '../../core/utils/math.util';

/** Owner id used for rebel units spawned by a rebellion (PROJECT_RULES.md section 5) — deliberately not a real faction/player. */
const REBEL_OWNER_ID = 'rebels';

/**
 * Ends the active player's turn: only valid once 'collectIncome' (the last
 * step of PROJECT_RULES.md section 3's cycle) has been reached — there is
 * no separate 'endTurn' phase. Rotates to the next non-eliminated player,
 * resets phase to 'buyUnits', and applies everything that happens "at the
 * start of a turn" for the incoming player (PROJECT_RULES.md section 5/19):
 * income credited (with any Citizen Satisfaction bonus/rebellion penalty
 * applied), the Citizen Satisfaction marker decayed, rebellionLevel
 * escalated if it lands in the red zone, and a rebel army spawned at their
 * capital the moment rebellionLevel first reaches 3. turnNumber increments
 * once per full round, i.e. when play wraps back toward the start of the
 * player list.
 */
export class EndTurnCommand implements Command {
  readonly type = 'EndTurn';

  constructor(
    private readonly playerId: string,
    private readonly economyConfig: EconomyConfig,
    private readonly factions: Readonly<Record<string, Faction>>,
    private readonly unitCatalog: Readonly<Record<string, UnitDefinition>>,
    private readonly rules: RulesEngine = new RulesEngine(),
  ) {}

  execute(state: GameState): CommandResult {
    if (state.phase !== 'collectIncome' || state.activePlayerId !== this.playerId) {
      return { state, events: [] };
    }

    const currentIndex = state.players.findIndex((player) => player.id === this.playerId);
    if (currentIndex === -1) {
      return { state, events: [] };
    }

    const nextIndex = findNextActivePlayerIndex(state.players, currentIndex);
    if (nextIndex === null) {
      // No other non-eliminated player exists; nothing to end the turn into.
      return { state, events: [] };
    }

    const wrapped = nextIndex <= currentIndex;
    const nextPlayer = state.players[nextIndex];
    const nextTurnNumber = wrapped ? state.turnNumber + 1 : state.turnNumber;

    const decayedSatisfaction = clamp(
      nextPlayer.citizenSatisfaction - this.economyConfig.citizenSatisfactionDecayPerTurn,
      this.economyConfig.citizenSatisfactionMin,
      this.economyConfig.citizenSatisfactionMax,
    );

    const zones = this.economyConfig.citizenSatisfactionZones;
    const rebellionZone = zones['rebellion'];
    const inRebellionZone = rebellionZone !== undefined && decayedSatisfaction <= rebellionZone.max;
    const previousRebellionLevel = nextPlayer.rebellionLevel;
    const nextRebellionLevel = inRebellionZone ? Math.min(3, previousRebellionLevel + 1) : previousRebellionLevel;

    const activeZone = findZone(zones, decayedSatisfaction);
    const incomeBonus = activeZone?.incomeBonus ?? 0;
    const victoryPointsGain = activeZone?.victoryPoints ?? 0;

    const baseIncome = this.rules.calculateIncome(state, nextPlayer.id);
    const boostedIncome = baseIncome + incomeBonus;
    const income = nextRebellionLevel >= 2 ? Math.floor(boostedIncome / 2) : boostedIncome;

    const justReachedMaxRebellion = previousRebellionLevel < 3 && nextRebellionLevel === 3;
    const spawn = justReachedMaxRebellion ? this.spawnRebelArmy(state, nextPlayer) : null;

    const nextPlayers = state.players.map((candidate) =>
      candidate.id === nextPlayer.id
        ? {
            ...candidate,
            treasury: candidate.treasury + income,
            citizenSatisfaction: decayedSatisfaction,
            rebellionLevel: nextRebellionLevel,
            victoryPoints: candidate.victoryPoints + victoryPointsGain,
          }
        : candidate,
    );

    const nextState: GameState = {
      ...state,
      phase: 'buyUnits',
      activePlayerId: nextPlayer.id,
      turnNumber: nextTurnNumber,
      players: nextPlayers,
      units: spawn ? [...state.units, ...spawn.units] : state.units,
      nextUnitInstanceId: spawn ? spawn.nextUnitInstanceId : state.nextUnitInstanceId,
    };

    const events: GameEngineEvent[] = [
      {
        type: 'TurnEnded',
        previousPlayerId: this.playerId,
        nextPlayerId: nextPlayer.id,
        turnNumber: nextTurnNumber,
      },
      { type: 'IncomeCollected', playerId: nextPlayer.id, amount: income },
      {
        type: 'CitizenSatisfactionChanged',
        playerId: nextPlayer.id,
        citizenSatisfaction: decayedSatisfaction,
        rebellionLevel: nextRebellionLevel,
      },
    ];
    if (spawn) {
      events.push({ type: 'RebelArmySpawned', playerId: nextPlayer.id, regionId: spawn.regionId });
    }
    return { state: nextState, events };
  }

  /**
   * Spawns the configured rebel army (data/economy.json "rebelArmy") at the
   * player's capital — only if they currently hold it. Purely a spawn: the
   * rebels coexist with any defenders already there, same as an in-progress
   * Attack (see attack.command.ts); actually resolving whether they take
   * the capital is real combat resolution, which doesn't exist yet.
   */
  private spawnRebelArmy(
    state: GameState,
    player: PlayerState,
  ): {
    readonly units: readonly UnitInstance[];
    readonly regionId: string;
    readonly nextUnitInstanceId: number;
  } | null {
    const faction = this.factions[player.factionId];
    const capitalRegion = faction ? state.regions[faction.capitalRegionId] : undefined;
    if (!capitalRegion || capitalRegion.ownerId !== player.id) {
      return null;
    }

    const units: UnitInstance[] = [];
    let counter = state.nextUnitInstanceId;
    for (const entry of this.economyConfig.rebelArmy) {
      for (let i = 0; i < entry.quantity; i += 1) {
        units.push({
          id: `unit-rebel-${counter}`,
          unitId: entry.unitId,
          ownerId: REBEL_OWNER_ID,
          regionId: capitalRegion.id,
          movesRemaining: this.unitCatalog[entry.unitId]?.movement ?? 0,
          transportedBy: null,
          hasFoughtThisTurn: false,
        });
        counter += 1;
      }
    }
    return { units, regionId: capitalRegion.id, nextUnitInstanceId: counter };
  }
}

function findZone(
  zones: Readonly<Record<string, CitizenSatisfactionZone>>,
  value: number,
): CitizenSatisfactionZone | null {
  for (const zone of Object.values(zones)) {
    if (value >= zone.min && value <= zone.max) {
      return zone;
    }
  }
  return null;
}

function findNextActivePlayerIndex(
  players: readonly PlayerState[],
  currentIndex: number,
): number | null {
  for (let step = 1; step <= players.length; step += 1) {
    const candidateIndex = (currentIndex + step) % players.length;
    if (candidateIndex === currentIndex) {
      return null;
    }
    if (!players[candidateIndex].isEliminated) {
      return candidateIndex;
    }
  }
  return null;
}
