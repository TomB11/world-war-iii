import { GameState } from '../../models/game-state.model';
import { RulesEngine } from '../rules-engine';

/** Solo Command Mode "Hack": the richest non-eliminated rival by treasury. */
export function pickHackTarget(state: GameState, playerId: string): string | null {
  const rivals = state.players.filter((player) => player.id !== playerId && !player.isEliminated);
  if (rivals.length === 0) {
    return null;
  }
  return rivals.reduce((best, candidate) => (candidate.treasury > best.treasury ? candidate : best)).id;
}

/** Solo Command Mode "Sabotage the richest enemy region" (and reused for the Threat Track's free missile strike target): the highest-value region owned by any rival. */
export function pickRichestEnemyRegion(state: GameState, playerId: string): string | null {
  const rivalRegions = Object.values(state.regions).filter(
    (region) => region.ownerId !== null && region.ownerId !== playerId,
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
