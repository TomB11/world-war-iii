import { GameState } from '../../models/game-state.model';
import { UnitDefinition } from '../../models/unit.model';
import { UnitInstance } from '../../models/unit-instance.model';
import { RulesEngine } from '../rules-engine';
import { AiOrderAction } from '../../models/ai-order.model';

interface AttackCandidate {
  readonly unitInstanceId: string;
  readonly targetRegionId: string;
  readonly hopCost: number;
}

/**
 * Every (unit, hostile target) pair this player could attack this turn —
 * defended or not. Rocket Systems (attack: 0, canDeclareMissile) never
 * appear here: declaring a missile strike is a separate future build step,
 * not a normal attack move.
 */
function collectAttackCandidates(
  state: GameState,
  playerId: string,
  unitCatalog: Readonly<Record<string, UnitDefinition>>,
  rules: RulesEngine,
): readonly AttackCandidate[] {
  const candidates: AttackCandidate[] = [];
  for (const unit of state.units) {
    if (
      unit.ownerId !== playerId ||
      unit.transportedBy !== null ||
      unit.hasFoughtThisTurn ||
      unit.movesRemaining <= 0
    ) {
      continue;
    }
    const unitDef = unitCatalog[unit.unitId];
    if (!unitDef || unitDef.attack <= 0) {
      continue;
    }
    const reach = rules.getReachableAttacks(state, unit, unitCatalog);
    for (const [targetRegionId, hopCost] of reach) {
      candidates.push({ unitInstanceId: unit.id, targetRegionId, hopCost });
    }
  }
  return candidates;
}

/** Defenders that actually fight — excludes embarked land/support cargo (RulesEngine.isCombatParticipant), relevant for a naval target (a sea zone). */
function realDefenders(
  state: GameState,
  targetRegionId: string,
  playerId: string,
  unitCatalog: Readonly<Record<string, UnitDefinition>>,
  rules: RulesEngine,
): readonly UnitInstance[] {
  return rules
    .getUnitsInRegion(state, targetRegionId)
    .filter((unit) => unit.ownerId !== playerId && rules.isCombatParticipant(unit, unitCatalog));
}

function isUndefended(
  state: GameState,
  targetRegionId: string,
  playerId: string,
  unitCatalog: Readonly<Record<string, UnitDefinition>>,
  rules: RulesEngine,
): boolean {
  return realDefenders(state, targetRegionId, playerId, unitCatalog, rules).length === 0;
}

function totalDefenseValue(
  state: GameState,
  targetRegionId: string,
  playerId: string,
  unitCatalog: Readonly<Record<string, UnitDefinition>>,
  rules: RulesEngine,
): number {
  return realDefenders(state, targetRegionId, playerId, unitCatalog, rules).reduce(
    (sum, unit) => sum + (unitCatalog[unit.unitId]?.defense ?? 0),
    0,
  );
}

/**
 * Solo Command Mode: picks one target REGION to attack this turn, matching
 * the rolled AI Order (rulebook section 4). Defended and undefended regions
 * are both eligible here — whether the AI actually commits to a defended
 * one is a separate gate (engine/ai/ai-attack-conditions.ts). A Helicopter
 * (canCapture: false) can still be picked against a DEFENDED region (it can
 * fight, just never solo-capture); getCommittingUnitIds below is what
 * actually filters units per-target when building the attacking force.
 */
export function pickAttackTargetRegion(
  state: GameState,
  playerId: string,
  action: AiOrderAction,
  unitCatalog: Readonly<Record<string, UnitDefinition>>,
  rules: RulesEngine,
): string | null {
  const candidates = collectAttackCandidates(state, playerId, unitCatalog, rules);
  if (candidates.length === 0) {
    return null;
  }

  const regionValue = (candidate: AttackCandidate): number => state.regions[candidate.targetRegionId]?.value ?? 0;
  const defenseValue = (candidate: AttackCandidate): number =>
    totalDefenseValue(state, candidate.targetRegionId, playerId, unitCatalog, rules);

  let chosen: AttackCandidate | null;
  switch (action) {
    case 'attackNearest':
      chosen = candidates.reduce((best, candidate) => (candidate.hopCost < best.hopCost ? candidate : best));
      break;
    case 'attackRichestAdjacent': {
      const adjacent = candidates.filter((candidate) => candidate.hopCost === 1);
      chosen =
        adjacent.length === 0
          ? null
          : adjacent.reduce((best, candidate) => (regionValue(candidate) > regionValue(best) ? candidate : best));
      break;
    }
    case 'attackWeakestAdjacent': {
      const adjacent = candidates.filter((candidate) => candidate.hopCost === 1);
      chosen =
        adjacent.length === 0
          ? null
          : adjacent.reduce((best, candidate) => (defenseValue(candidate) < defenseValue(best) ? candidate : best));
      break;
    }
    default:
      // reinforceThreatened / pressureNeutral / doctrineSpecial — future build steps.
      chosen = null;
  }

  return chosen?.targetRegionId ?? null;
}

/**
 * All of this player's units that could join an attack on `targetRegionId`
 * this turn (used both to evaluate attack conditions and to actually
 * dispatch the attack). A Helicopter is excluded when the target is
 * currently undefended, since AttackCommand rejects a solo Helicopter
 * capture — it's still included against a defended target, where it can
 * fight normally.
 */
export function getCommittingUnitIds(
  state: GameState,
  playerId: string,
  targetRegionId: string,
  unitCatalog: Readonly<Record<string, UnitDefinition>>,
  rules: RulesEngine,
): readonly string[] {
  const undefended = isUndefended(state, targetRegionId, playerId, unitCatalog, rules);
  const canJoin = (unitInstanceId: string): boolean => {
    if (!undefended) {
      return true;
    }
    const unit = rules.getUnitInstance(state, unitInstanceId);
    return unit ? unitCatalog[unit.unitId]?.canCapture !== false : false;
  };

  return collectAttackCandidates(state, playerId, unitCatalog, rules)
    .filter((candidate) => candidate.targetRegionId === targetRegionId && canJoin(candidate.unitInstanceId))
    .map((candidate) => candidate.unitInstanceId);
}
