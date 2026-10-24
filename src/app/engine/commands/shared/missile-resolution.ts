import { GameState } from '../../../models/game-state.model';
import { UnitDefinition } from '../../../models/unit.model';
import { Faction } from '../../../models/faction.model';
import { MissileOutcome } from '../../../models/region-combat.model';
import { RulesEngine } from '../../rules-engine';
import { rollDie } from '../../random';
import { DICE_SIDES } from '../../constants/dice.constants';
import { INTERCEPT_THRESHOLD } from '../fire-missile.constants';

export interface MissileStrikeResolution {
  readonly interceptRoll: number | null;
  readonly attackRoll: number | null;
  readonly outcome: MissileOutcome;
  readonly nextSeed: number;
}

/**
 * Shared missile interception/hit math (PROJECT_RULES.md section 15): if a
 * defending Rocket System is present, roll to intercept first (<= 2 destroys
 * the missile); otherwise (or if it survives), roll against the missile's
 * own attack value. Shared by FireMissileCommand (a Rocket System's normal
 * supporting strike) and ApplyFreeMissileStrikeCommand (Solo Command Mode's
 * Threat Track bonus strike).
 */
export function resolveMissileStrike(
  seed: number,
  missileAttackValue: number,
  interceptorPresent: boolean,
): MissileStrikeResolution {
  let currentSeed = seed;
  let interceptRoll: number | null = null;
  let attackRoll: number | null = null;
  let outcome: MissileOutcome = 'miss';

  if (interceptorPresent) {
    const roll = rollDie(currentSeed, DICE_SIDES);
    currentSeed = roll.nextSeed;
    interceptRoll = roll.result;
    if (roll.result <= INTERCEPT_THRESHOLD) {
      outcome = 'intercepted';
    }
  }

  if (outcome !== 'intercepted') {
    const roll = rollDie(currentSeed, DICE_SIDES);
    currentSeed = roll.nextSeed;
    attackRoll = roll.result;
    outcome = roll.result <= missileAttackValue ? 'hit' : 'miss';
  }

  return { interceptRoll, attackRoll, outcome, nextSeed: currentSeed };
}

/** Whether a hostile Rocket System (never a teammate of the launching player) sits in the target region or an adjacent one (PROJECT_RULES.md section 15). */
export function hasInterceptor(
  state: GameState,
  targetRegionId: string,
  playerId: string,
  unitCatalog: Readonly<Record<string, UnitDefinition>>,
  rules: RulesEngine,
  factions: Readonly<Record<string, Faction>>,
): boolean {
  const targetRegion = state.regions[targetRegionId];
  const neighborIds = new Set(targetRegion?.neighbors ?? []);
  return state.units.some(
    (unit) =>
      rules.isHostileTo(state, unit.ownerId, playerId, factions) &&
      (unit.regionId === targetRegionId || neighborIds.has(unit.regionId)) &&
      unitCatalog[unit.unitId]?.canDeclareMissile,
  );
}
