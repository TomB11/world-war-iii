import { GameState, GamePhase } from '../models/game-state.model';
import { Region } from '../models/region.model';
import { UnitDefinition } from '../models/unit.model';
import { UnitInstance } from '../models/unit-instance.model';
import { PlayerState } from '../models/player.model';
import { EconomyConfig } from '../models/economy-config.model';

/**
 * Minimal fixtures shared by engine specs. Not part of the app build — no
 * production code imports this file, so it's never pulled into the
 * tsconfig.app.json program (which roots only from src/main.ts).
 */
/** CODING_STANDARTS.txt bans non-null assertions (!) — use this instead of `!` to unwrap a value expected to be present in a test. */
export function must<T>(value: T | undefined, message: string): T {
  if (value === undefined) {
    throw new Error(message);
  }
  return value;
}

export function region(overrides: Partial<Region> & { id: string }): Region {
  return {
    name: overrides.id,
    ownerId: null,
    value: 1,
    factory: 0,
    isVictoryStar: false,
    neighbors: [],
    position: { x: 0, y: 0 },
    ...overrides,
  };
}

export function unitDef(overrides: Partial<UnitDefinition> & { id: string }): UnitDefinition {
  return {
    name: overrides.id,
    category: 'land',
    cost: 1,
    attack: 1,
    defense: 1,
    movement: 1,
    transportCapacity: 0,
    ...overrides,
  };
}

export function unitInstance(overrides: Partial<UnitInstance> & { id: string; unitId: string; ownerId: string; regionId: string }): UnitInstance {
  return {
    movesRemaining: 1,
    transportedBy: null,
    hasFoughtThisTurn: false,
    ...overrides,
  };
}

export function player(overrides: Partial<PlayerState> & { id: string }): PlayerState {
  return {
    factionId: overrides.id,
    displayName: overrides.id,
    treasury: 0,
    isEliminated: false,
    reserve: [],
    hackLevel: 1,
    citizenSatisfaction: 50,
    rebellionLevel: 0,
    victoryPoints: 0,
    hasUsedCyberAttackThisTurn: false,
    ...overrides,
  };
}

export const TEST_ECONOMY_CONFIG: EconomyConfig = {
  citizenSatisfactionMin: 0,
  citizenSatisfactionMax: 80,
  citizenSatisfactionDecayPerTurn: 5,
  citizenSatisfactionZones: {
    rebellion: { min: 0, max: 20 },
  },
  rebelArmy: [{ unitId: 'infantry', quantity: 2 }],
  neutralArmy: [],
  captureSatisfactionPenaltyAttacker: 5,
  captureSatisfactionPenaltyDefender: 5,
  cyberAttackCost: 5,
  politicalInfluenceThreshold: 3,
  politicalInfluenceMajority: 2,
  soloVictoryStarCount: 6,
  teamVictoryStarCount: 10,
  hackLevelUpgradeCost: 10,
  hackLevelMax: 3,
  infantryAirborneUpgradeCost: 5,
};

export function testState(overrides: Partial<GameState> = {}): GameState {
  return {
    regions: {},
    seaZones: {},
    straits: [],
    players: [],
    units: [],
    activePlayerId: 'p1',
    phase: 'attackMoves' as GamePhase,
    turnNumber: 1,
    randomSeed: 1,
    nextUnitInstanceId: 1,
    combats: {},
    ...overrides,
  };
}
