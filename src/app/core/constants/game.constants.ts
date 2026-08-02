import { GamePhase } from '../../models/game-state.model';

/**
 * Technical constants only. Gameplay values (income, combat, movement, etc.)
 * must never live here — they belong in JSON under src/app/data
 * (CODING_STANDARDS.md section 12 / PROJECT_RULES.md section 30).
 */
/** Default value for DATA_BASE_PATH_TOKEN (core/di/data-base-path.token.ts). */
export const DATA_BASE_PATH = 'data' as const;

/** Filenames only — resolved against DATA_BASE_PATH_TOKEN by DataLoaderService. */
export const COUNTRIES_DATA_FILE = 'countries.json' as const;
export const FACTIONS_DATA_FILE = 'factions.json' as const;
export const ECONOMY_DATA_FILE = 'economy.json' as const;
export const UNITS_DATA_FILE = 'units.json' as const;
export const STRAITS_DATA_FILE = 'straits.json' as const;
export const SEA_ZONES_DATA_FILE = 'sea-zones.json' as const;
export const STARTING_DEPLOYMENT_DATA_FILE = 'starting-deployment.json' as const;
/** Solo Command Mode only — see models/ai-purchase-chart.model.ts. */
export const AI_PURCHASE_CHART_DATA_FILE = 'ai-purchase-chart.json' as const;
/** Solo Command Mode only — see models/ai-order.model.ts. */
export const AI_ORDER_TABLE_DATA_FILE = 'ai-order-table.json' as const;
/** Solo Command Mode only — see models/ai-attack-conditions.model.ts. */
export const AI_ATTACK_CONDITIONS_DATA_FILE = 'ai-attack-conditions.json' as const;
/** Solo Command Mode only — see models/ai-cyber-action.model.ts. */
export const AI_CYBER_ACTION_TABLE_DATA_FILE = 'ai-cyber-action-table.json' as const;
/** Solo Command Mode only — see models/ai-threat-track.model.ts. */
export const AI_THREAT_TRACK_DATA_FILE = 'ai-threat-track.json' as const;
/** Solo Command Mode only — see models/ai-difficulty.model.ts. */
export const AI_DIFFICULTY_DATA_FILE = 'ai-difficulty.json' as const;
/** Solo Command Mode only — see models/ai-sabotage.model.ts. */
export const AI_SABOTAGE_EFFECTS_DATA_FILE = 'ai-sabotage-effects.json' as const;

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
