import { GameState } from '../../models/game-state.model';
import { UnitDefinition } from '../../models/unit.model';
import { UnitInstance } from '../../models/unit-instance.model';
import { Faction } from '../../models/faction.model';
import { RulesEngine } from '../rules-engine';

/** How many of a region's neighbors are NOT owned by `ownerId` — "frontline exposure," shared by the Tactical Moves heuristic below and the Fortress doctrine's reinforcement priority. */
export function scoreFrontlineExposure(state: GameState, rules: RulesEngine, regionId: string, ownerId: string): number {
  return rules.getNeighborRegions(state, regionId).filter((neighbor) => neighbor.ownerId !== ownerId).length;
}

/**
 * Solo Command Mode's Tactical Moves heuristic ("move surviving units toward
 * the nearest high-value front"): scores each reachable destination
 * (RulesEngine.getTacticalMoveDestinations — never reimplements pathing) by
 * frontline exposure, and moves there only if that's strictly better than
 * staying put. Returns null when nothing reachable improves the unit's
 * position.
 */
export function chooseTacticalDestination(
  state: GameState,
  unit: UnitInstance,
  unitCatalog: Readonly<Record<string, UnitDefinition>>,
  factions: Readonly<Record<string, Faction>>,
  rules: RulesEngine,
): string | null {
  const destinations = rules.getTacticalMoveDestinations(state, unit, unitCatalog, factions);
  if (destinations.length === 0) {
    return null;
  }

  const currentScore = scoreFrontlineExposure(state, rules, unit.regionId, unit.ownerId);
  let best: { regionId: string; score: number } | null = null;
  for (const regionId of destinations) {
    const score = scoreFrontlineExposure(state, rules, regionId, unit.ownerId);
    if (!best || score > best.score) {
      best = { regionId, score };
    }
  }

  if (!best || best.score <= currentScore) {
    return null;
  }
  return best.regionId;
}

/**
 * Solo Command Mode's Fortress doctrine special ("reinforce the
 * frontline"): among several legal deploy destinations for one Reserve unit,
 * picks the one with the highest frontline exposure instead of just the
 * first — the normal Place New Units behavior otherwise uses.
 */
export function pickMostThreatenedDestination(
  state: GameState,
  playerId: string,
  destinations: readonly string[],
  rules: RulesEngine,
): string | null {
  if (destinations.length === 0) {
    return null;
  }
  let best = destinations[0];
  let bestScore = scoreFrontlineExposure(state, rules, best, playerId);
  for (const candidate of destinations.slice(1)) {
    const score = scoreFrontlineExposure(state, rules, candidate, playerId);
    if (score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  }
  return best;
}
