import { GamePhase } from '../../models/game-state.model';

/**
 * Technical constants only. Gameplay values (income, combat, movement, etc.)
 * must never live here — they belong in JSON under src/app/data
 * (CODING_STANDARDS.md section 12 / PROJECT_RULES.md section 30).
 */
export const DATA_BASE_PATH = 'data' as const;

export const COUNTRIES_DATA_FILE = `${DATA_BASE_PATH}/countries.json` as const;
export const FACTIONS_DATA_FILE = `${DATA_BASE_PATH}/factions.json` as const;
export const ECONOMY_DATA_FILE = `${DATA_BASE_PATH}/economy.json` as const;
export const UNITS_DATA_FILE = `${DATA_BASE_PATH}/units.json` as const;
export const STRAITS_DATA_FILE = `${DATA_BASE_PATH}/straits.json` as const;
export const SEA_ZONES_DATA_FILE = `${DATA_BASE_PATH}/sea-zones.json` as const;
export const STARTING_DEPLOYMENT_DATA_FILE = `${DATA_BASE_PATH}/starting-deployment.json` as const;

/** Turn order exactly as defined in PROJECT_RULES.md section 3. Structural, not tunable data. */
export const TURN_PHASE_ORDER: readonly GamePhase[] = [
  'buyUnits',
  'cyberAttack',
  'attackMoves',
  'attack',
  'tacticalMoves',
  'placeNewUnits',
  'collectIncome',
];

/**
 * Phases in which units may move (PROJECT_RULES.md sections 7 and 17).
 * Movement points are a single per-turn pool shared across both phases in
 * this vertical slice — true "combat move" vs "non-combat move" semantics
 * require the Combat engine (Phase 6) to distinguish units that fought.
 */
export const MOVEMENT_PHASES: readonly GamePhase[] = ['attackMoves', 'tacticalMoves'];
