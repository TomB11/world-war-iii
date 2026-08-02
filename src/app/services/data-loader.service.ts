import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import {
  AI_ATTACK_CONDITIONS_DATA_FILE,
  AI_CYBER_ACTION_TABLE_DATA_FILE,
  AI_DIFFICULTY_DATA_FILE,
  AI_ORDER_TABLE_DATA_FILE,
  AI_PURCHASE_CHART_DATA_FILE,
  AI_SABOTAGE_EFFECTS_DATA_FILE,
  AI_THREAT_TRACK_DATA_FILE,
  COUNTRIES_DATA_FILE,
  ECONOMY_DATA_FILE,
  FACTIONS_DATA_FILE,
  SEA_ZONES_DATA_FILE,
  STARTING_DEPLOYMENT_DATA_FILE,
  STRAITS_DATA_FILE,
  UNITS_DATA_FILE,
} from '../core/constants/game.constants';
import { DATA_BASE_PATH_TOKEN } from '../core/di/data-base-path.token';
import { NEUTRAL_ARMY_OWNER_ID } from '../core/constants/synthetic-owner-ids.constants';
import { STARTING_RANDOM_SEED } from './data-loader.constants';
import { Faction } from '../models/faction.model';
import { GameState } from '../models/game-state.model';
import { PlayerState } from '../models/player.model';
import { Region } from '../models/region.model';
import { SeaZone } from '../models/sea-zone.model';
import { Strait } from '../models/strait.model';
import { UnitDefinition } from '../models/unit.model';
import { UnitInstance } from '../models/unit-instance.model';
import { EconomyConfig } from '../models/economy-config.model';
import { AiConfig } from '../models/ai-config.model';
import { AiPurchaseChartData } from '../models/ai-purchase-chart.model';
import { AiOrderTableData } from '../models/ai-order.model';
import { AiAttackConditionsData } from '../models/ai-attack-conditions.model';
import { AiCyberActionTableData } from '../models/ai-cyber-action.model';
import { AiThreatTrackData } from '../models/ai-threat-track.model';
import { AiDifficultyData } from '../models/ai-difficulty.model';
import { AiSabotageEffectsData } from '../models/ai-sabotage.model';
import { RulesEngine } from '../engine/rules-engine';
import { SoloSelection } from '../state/solo-setup.state';

interface CountriesDataFile {
  readonly regions: readonly Region[];
}

interface FactionsDataFile {
  readonly factions: readonly Faction[];
}

interface EconomyDataFile extends EconomyConfig {
  readonly startingTreasury: number;
  readonly startingHackLevel: number;
  readonly startingCitizenSatisfaction: number;
}

interface UnitsDataFile {
  readonly units: readonly UnitDefinition[];
}

interface StraitsDataFile {
  readonly straits: readonly Strait[];
}

interface SeaZonesDataFile {
  readonly seaZones: readonly SeaZone[];
}

interface StartingDeploymentEntry {
  readonly unitId: string;
  readonly regionId: string;
  readonly quantity: number;
}

interface StartingDeploymentDataFile {
  readonly deployment: Readonly<Record<string, readonly StartingDeploymentEntry[]>>;
}

export interface InitialGameData {
  readonly gameState: GameState;
  readonly factions: readonly Faction[];
  readonly units: Readonly<Record<string, UnitDefinition>>;
  readonly economyConfig: EconomyConfig;
  /** Solo Command Mode static tuning data — read by RollAiPurchaseChartCommand regardless of whether AI is active this game. */
  readonly aiPurchaseChart: AiPurchaseChartData;
  /** Solo Command Mode static tuning data — read by RollAiOrderCommand regardless of whether AI is active this game. */
  readonly aiOrderTable: AiOrderTableData;
  /** Solo Command Mode static tuning data — read by the AI decision engine when evaluating a defended attack, regardless of whether AI is active this game. */
  readonly aiAttackConditions: AiAttackConditionsData;
  /** Solo Command Mode static tuning data — read by RollAiCyberActionCommand regardless of whether AI is active this game. */
  readonly aiCyberActionTable: AiCyberActionTableData;
  /** Solo Command Mode static tuning data — read by IncrementThreatCommand regardless of whether AI is active this game. */
  readonly aiThreatTrack: AiThreatTrackData;
  /** Solo Command Mode static tuning data — read by GameStore.initialize() and AiTurnService regardless of whether AI is active this game. */
  readonly aiDifficulty: AiDifficultyData;
  /** Solo Command Mode static tuning data — read by AiSabotageCommand regardless of whether AI is active this game. */
  readonly aiSabotageEffects: AiSabotageEffectsData;
}

/**
 * Loads all static gameplay data from JSON (never hardcoded, per
 * PROJECT_RULES.md section 41) and assembles the very first GameState.
 * This is the only place JSON parsing/HTTP happens; the Game Engine never
 * talks to the network.
 */
@Injectable({ providedIn: 'root' })
export class DataLoaderService {
  private readonly http = inject(HttpClient);
  private readonly dataBasePath = inject(DATA_BASE_PATH_TOKEN);

  async loadInitialGameData(soloSelection: SoloSelection | null = null): Promise<InitialGameData> {
    const dataFile = (fileName: string): string => `${this.dataBasePath}/${fileName}`;
    const [
      countries,
      factionsFile,
      economy,
      unitsFile,
      straitsFile,
      seaZonesFile,
      startingDeploymentFile,
      aiPurchaseChart,
      aiOrderTable,
      aiAttackConditions,
      aiCyberActionTable,
      aiThreatTrack,
      aiDifficulty,
      aiSabotageEffects,
    ] = await Promise.all([
      firstValueFrom(this.http.get<CountriesDataFile>(dataFile(COUNTRIES_DATA_FILE))),
      firstValueFrom(this.http.get<FactionsDataFile>(dataFile(FACTIONS_DATA_FILE))),
      firstValueFrom(this.http.get<EconomyDataFile>(dataFile(ECONOMY_DATA_FILE))),
      firstValueFrom(this.http.get<UnitsDataFile>(dataFile(UNITS_DATA_FILE))),
      firstValueFrom(this.http.get<StraitsDataFile>(dataFile(STRAITS_DATA_FILE))),
      firstValueFrom(this.http.get<SeaZonesDataFile>(dataFile(SEA_ZONES_DATA_FILE))),
      firstValueFrom(this.http.get<StartingDeploymentDataFile>(dataFile(STARTING_DEPLOYMENT_DATA_FILE))),
      firstValueFrom(this.http.get<AiPurchaseChartData>(dataFile(AI_PURCHASE_CHART_DATA_FILE))),
      firstValueFrom(this.http.get<AiOrderTableData>(dataFile(AI_ORDER_TABLE_DATA_FILE))),
      firstValueFrom(this.http.get<AiAttackConditionsData>(dataFile(AI_ATTACK_CONDITIONS_DATA_FILE))),
      firstValueFrom(this.http.get<AiCyberActionTableData>(dataFile(AI_CYBER_ACTION_TABLE_DATA_FILE))),
      firstValueFrom(this.http.get<AiThreatTrackData>(dataFile(AI_THREAT_TRACK_DATA_FILE))),
      firstValueFrom(this.http.get<AiDifficultyData>(dataFile(AI_DIFFICULTY_DATA_FILE))),
      firstValueFrom(this.http.get<AiSabotageEffectsData>(dataFile(AI_SABOTAGE_EFFECTS_DATA_FILE))),
    ]);

    const regions: Record<string, Region> = {};
    for (const region of countries.regions) {
      regions[region.id] = region;
    }

    const seaZones: Record<string, SeaZone> = {};
    for (const seaZone of seaZonesFile.seaZones) {
      seaZones[seaZone.id] = seaZone;
    }

    const units: Record<string, UnitDefinition> = {};
    for (const unit of unitsFile.units) {
      units[unit.id] = unit;
    }

    const players: PlayerState[] = factionsFile.factions.map((faction) => ({
      id: faction.id,
      factionId: faction.id,
      displayName: faction.name,
      treasury: economy.startingTreasury,
      isEliminated: false,
      reserve: [],
      hackLevel: economy.startingHackLevel,
      citizenSatisfaction: economy.startingCitizenSatisfaction,
      rebellionLevel: 0,
      victoryPoints: 0,
      hasUsedCyberAttackThisTurn: false,
    }));

    const firstPlayer = players[0];
    if (!firstPlayer) {
      throw new Error('No factions were loaded from factions.json');
    }

    const startingUnits: UnitInstance[] = [];
    let nextUnitInstanceId = 1;
    for (const faction of factionsFile.factions) {
      const entries = startingDeploymentFile.deployment[faction.id] ?? [];
      for (const entry of entries) {
        for (let i = 0; i < entry.quantity; i += 1) {
          startingUnits.push({
            id: `unit-${nextUnitInstanceId}`,
            unitId: entry.unitId,
            ownerId: faction.id,
            regionId: entry.regionId,
            movesRemaining: units[entry.unitId]?.movement ?? 0,
            transportedBy: null,
            hasFoughtThisTurn: false,
          });
          nextUnitInstanceId += 1;
        }
      }
    }

    // Every neutral region starts with a standing garrison (PROJECT_RULES.md
    // section 2): attacking or politically influencing a neutral country
    // means fighting/inheriting this real army, not an empty region.
    for (const region of countries.regions) {
      if (region.ownerId !== null) {
        continue;
      }
      for (const entry of economy.neutralArmy) {
        for (let i = 0; i < entry.quantity; i += 1) {
          startingUnits.push({
            id: `unit-${nextUnitInstanceId}`,
            unitId: entry.unitId,
            ownerId: NEUTRAL_ARMY_OWNER_ID,
            regionId: region.id,
            movesRemaining: units[entry.unitId]?.movement ?? 0,
            transportedBy: null,
            hasFoughtThisTurn: false,
          });
          nextUnitInstanceId += 1;
        }
      }
    }

    // Solo Command Mode: the AI plays whichever team the player did NOT pick
    // on the choose-side screen. Only two teamIds exist today (team-west,
    // team-east), so "the other one" is simply the first faction whose
    // teamId differs from the human's pick.
    const aiTeamId = soloSelection
      ? (factionsFile.factions.find((faction) => faction.teamId !== soloSelection.humanTeamId)?.teamId ?? null)
      : null;
    const aiConfig: AiConfig | null =
      soloSelection && aiTeamId
        ? {
            doctrine: soloSelection.doctrine,
            difficulty: soloSelection.difficulty,
            aiTeamId,
            threatLevel: 0,
            totalWarActive: false,
          }
        : null;

    const gameStateBeforeFirstIncome: GameState = {
      regions,
      seaZones,
      straits: straitsFile.straits,
      players,
      units: startingUnits,
      activePlayerId: firstPlayer.id,
      phase: 'buyUnits',
      turnNumber: 1,
      randomSeed: STARTING_RANDOM_SEED,
      nextUnitInstanceId,
      combats: {},
      missileDeclarations: {},
      unitsDeployedThisTurn: {},
      aiConfig,
      sabotagedRegionIds: [],
    };

    // The first active player's turn-1 income is credited immediately at
    // game start (rather than waiting for an EndTurnCommand rotation into
    // them, see PROJECT_RULES.md section 19), so Buy Units on turn 1 isn't
    // stuck at zero treasury.
    const firstTurnIncome = new RulesEngine().calculateIncome(gameStateBeforeFirstIncome, firstPlayer.id);
    const gameState: GameState = {
      ...gameStateBeforeFirstIncome,
      players: players.map((player) =>
        player.id === firstPlayer.id ? { ...player, treasury: player.treasury + firstTurnIncome } : player,
      ),
    };

    const economyConfig: EconomyConfig = {
      citizenSatisfactionMin: economy.citizenSatisfactionMin,
      citizenSatisfactionMax: economy.citizenSatisfactionMax,
      citizenSatisfactionDecayPerTurn: economy.citizenSatisfactionDecayPerTurn,
      citizenSatisfactionZones: economy.citizenSatisfactionZones,
      rebelArmy: economy.rebelArmy,
      neutralArmy: economy.neutralArmy,
      captureSatisfactionPenaltyAttacker: economy.captureSatisfactionPenaltyAttacker,
      captureSatisfactionPenaltyDefender: economy.captureSatisfactionPenaltyDefender,
      cyberAttackCost: economy.cyberAttackCost,
      politicalInfluenceThreshold: economy.politicalInfluenceThreshold,
      politicalInfluenceMajority: economy.politicalInfluenceMajority,
      soloVictoryStarCount: economy.soloVictoryStarCount,
      teamVictoryStarCount: economy.teamVictoryStarCount,
      hackLevelUpgradeCost: economy.hackLevelUpgradeCost,
      hackLevelMax: economy.hackLevelMax,
      infantryAirborneUpgradeCost: economy.infantryAirborneUpgradeCost,
    };

    return {
      gameState,
      factions: factionsFile.factions,
      units,
      economyConfig,
      aiPurchaseChart,
      aiOrderTable,
      aiAttackConditions,
      aiCyberActionTable,
      aiThreatTrack,
      aiDifficulty,
      aiSabotageEffects,
    };
  }
}
