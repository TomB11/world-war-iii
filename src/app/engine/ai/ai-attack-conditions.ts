import { GameState } from '../../models/game-state.model';
import { UnitDefinition } from '../../models/unit.model';
import { Faction } from '../../models/faction.model';
import { AiAttackConditionsData } from '../../models/ai-attack-conditions.model';
import { RulesEngine } from '../rules-engine';

/** Whether a region counts as a "capital or key front" (rulebook section 4/3) — a faction's capital, or one of the map's white-star victory regions (this codebase's existing analog for "strategically important"). */
function isCapitalOrKeyFront(
  state: GameState,
  targetRegionId: string,
  factions: Readonly<Record<string, Faction>>,
): boolean {
  const region = state.regions[targetRegionId];
  if (!region) {
    return false;
  }
  if (region.isVictoryStar) {
    return true;
  }
  return Object.values(factions).some((faction) => faction.capitalRegionId === targetRegionId);
}

/**
 * Solo Command Mode's "AI Attack Conditions" (rulebook section 3): the AI
 * only commits to attacking a DEFENDED region if at least one condition is
 * true. An undefended target is always attacked regardless — it's a free
 * capture with no dice involved, so there's nothing to gate.
 */
export function evaluateAttackConditions(
  state: GameState,
  playerId: string,
  targetRegionId: string,
  committingUnitIds: readonly string[],
  unitCatalog: Readonly<Record<string, UnitDefinition>>,
  factions: Readonly<Record<string, Faction>>,
  conditionsData: AiAttackConditionsData,
  rules: RulesEngine,
): boolean {
  const defenders = rules
    .getUnitsInRegion(state, targetRegionId)
    .filter((unit) => unit.ownerId !== playerId && rules.isCombatParticipant(unit, unitCatalog));
  if (defenders.length === 0) {
    return true;
  }

  const hasNumericalAdvantage = committingUnitIds.length >= defenders.length + conditionsData.numericalAdvantageDelta;

  const hasSupport = committingUnitIds.some((unitInstanceId) => {
    const unit = rules.getUnitInstance(state, unitInstanceId);
    return unit ? unitCatalog[unit.unitId]?.aiAttackSupport === true : false;
  });

  const regionValue = state.regions[targetRegionId]?.value ?? 0;
  const isHighValue = conditionsData.highValueThresholds.includes(regionValue);

  const isKeyFront = isCapitalOrKeyFront(state, targetRegionId, factions);

  return hasNumericalAdvantage || hasSupport || isHighValue || isKeyFront;
}
