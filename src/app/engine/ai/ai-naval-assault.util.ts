import { GameState } from '../../models/game-state.model';
import { UnitDefinition } from '../../models/unit.model';
import { RulesEngine } from '../rules-engine';

export interface NavalAssaultPlan {
  readonly passengerUnitId: string;
  readonly transportUnitId: string;
  readonly sailToSeaZoneId: string;
  readonly targetRegionId: string;
}

function isHostileCoast(state: GameState, regionId: string, playerId: string, rules: RulesEngine): boolean {
  const region = state.regions[regionId];
  if (!region) {
    return false;
  }
  if (region.ownerId !== null && region.ownerId !== playerId) {
    return true;
  }
  return rules.getUnitsInRegion(state, regionId).some((unit) => unit.ownerId !== playerId);
}

/**
 * Solo Command Mode naval-assault fallback, tried during Attack Moves when
 * no land/air unit can directly reach an attack target this turn
 * (engine/ai/ai-order-targets.util.ts's pickAttackTargetRegion returned
 * null): finds one of the player's own eligible units that could board a
 * transport, and a sea zone that transport can reach bordering a hostile
 * coast — reusing the existing naval-repositioning-during-Attack-Moves
 * capability (RulesEngine.getReachableMoves) rather than reimplementing
 * pathing. Returns the full plan for services/ai-turn.service.ts to
 * dispatch as load -> sail -> unload-as-assault, or null if no viable
 * transport/passenger/coast combination exists this turn.
 */
export function pickNavalAssaultPlan(
  state: GameState,
  playerId: string,
  unitCatalog: Readonly<Record<string, UnitDefinition>>,
  rules: RulesEngine,
): NavalAssaultPlan | null {
  const passengers = state.units.filter(
    (unit) =>
      unit.ownerId === playerId &&
      unit.transportedBy === null &&
      !unit.hasFoughtThisTurn &&
      unit.movesRemaining > 0 &&
      (unitCatalog[unit.unitId]?.attack ?? 0) > 0,
  );

  for (const passenger of passengers) {
    for (const { transportId } of rules.getLoadableTransportTargets(state, passenger, unitCatalog)) {
      const transport = rules.getUnitInstance(state, transportId);
      if (!transport || transport.movesRemaining <= 0) {
        continue;
      }

      // Sailing 0 hops (unload right where the transport already sits) is a
      // legitimate option too — getReachableMoves never includes the
      // starting position itself (it's a BFS over NEIGHBOURS), so it's added
      // back in here explicitly.
      const reach = new Map(rules.getReachableMoves(state, transport, unitCatalog));
      reach.set(transport.regionId, 0);

      let best: { seaZoneId: string; targetRegionId: string; hopCost: number } | null = null;
      for (const [seaZoneId, hopCost] of reach) {
        const seaZone = state.seaZones[seaZoneId];
        if (!seaZone) {
          continue;
        }
        for (const coastRegionId of seaZone.adjacentRegionIds) {
          if (isHostileCoast(state, coastRegionId, playerId, rules) && (!best || hopCost < best.hopCost)) {
            best = { seaZoneId, targetRegionId: coastRegionId, hopCost };
          }
        }
      }

      if (best) {
        return {
          passengerUnitId: passenger.id,
          transportUnitId: transportId,
          sailToSeaZoneId: best.seaZoneId,
          targetRegionId: best.targetRegionId,
        };
      }
    }
  }

  return null;
}
