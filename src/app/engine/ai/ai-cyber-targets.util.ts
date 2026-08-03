import { GameState } from '../../models/game-state.model';
import { Faction } from '../../models/faction.model';
import { RulesEngine } from '../rules-engine';

/** Solo Command Mode "Hack": the richest non-eliminated, non-allied rival by treasury (teammates, PROJECT_RULES.md section 2, are never a valid Hack target — hacking is an attack). */
export function pickHackTarget(
  state: GameState,
  playerId: string,
  factions: Readonly<Record<string, Faction>>,
  rules: RulesEngine,
): string | null {
  const rivals = state.players.filter(
    (player) => player.id !== playerId && !player.isEliminated && rules.isHostileTo(state, player.id, playerId, factions),
  );
  if (rivals.length === 0) {
    return null;
  }
  return rivals.reduce((best, candidate) => (candidate.treasury > best.treasury ? candidate : best)).id;
}

/** Solo Command Mode "Sabotage the richest enemy region" (and reused for the Threat Track's free missile strike target): the highest-value region owned by any non-allied rival — sabotage/missile strikes are attacks, so a teammate's region is never eligible. */
export function pickRichestEnemyRegion(
  state: GameState,
  playerId: string,
  factions: Readonly<Record<string, Faction>>,
  rules: RulesEngine,
): string | null {
  const rivalRegions = Object.values(state.regions).filter(
    (region) => region.ownerId !== null && rules.isHostileTo(state, region.ownerId, playerId, factions),
  );
  if (rivalRegions.length === 0) {
    return null;
  }
  return rivalRegions.reduce((best, candidate) => (candidate.value > best.value ? candidate : best)).id;
}

/** Solo Command Mode "Political Influence"/"pressure a neutral region": the highest-value neutral region bordering one of this player's own regions. */
export function pickInfluenceTarget(state: GameState, playerId: string, rules: RulesEngine): string | null {
  const eligible = Object.values(state.regions).filter(
    (region) =>
      region.ownerId === null &&
      rules.getNeighborRegions(state, region.id).some((neighbor) => neighbor.ownerId === playerId),
  );
  if (eligible.length === 0) {
    return null;
  }
  return eligible.reduce((best, candidate) => (candidate.value > best.value ? candidate : best)).id;
}
