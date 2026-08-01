/**
 * Owner ids used for units that don't belong to any real faction/player —
 * neither is ever a key in GameState.players, so treat them as opaque
 * markers, not a player lookup.
 */

/** Standing garrison spawned in every neutral region at game start (DataLoaderService, PROJECT_RULES.md section 33). */
export const NEUTRAL_ARMY_OWNER_ID = 'neutral';

/** Rebel army spawned by a rebellion once rebellionLevel reaches 3 (EndTurnCommand, PROJECT_RULES.md section 5). */
export const REBEL_OWNER_ID = 'rebels';
