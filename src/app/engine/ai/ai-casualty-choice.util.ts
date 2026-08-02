import { UnitDefinition } from '../../models/unit.model';
import { UnitInstance } from '../../models/unit-instance.model';

/**
 * Solo Command Mode's casualty-choice heuristic, used for the AI's own side
 * of the RemoveCasualtyCommand loop (whichever side must remove a unit this
 * round): sacrifices the cheapest unit first, preserving the strongest
 * survivors for the rest of the battle. `candidates` must be non-empty —
 * callers only invoke this when a casualty step is actually pending, which
 * guarantees at least one unit is present to remove.
 */
export function chooseCasualtyUnit(
  candidates: readonly UnitInstance[],
  unitCatalog: Readonly<Record<string, UnitDefinition>>,
): string {
  let cheapest = candidates[0];
  let cheapestCost = unitCatalog[cheapest.unitId]?.cost ?? 0;
  for (const candidate of candidates.slice(1)) {
    const cost = unitCatalog[candidate.unitId]?.cost ?? 0;
    if (cost < cheapestCost) {
      cheapest = candidate;
      cheapestCost = cost;
    }
  }
  return cheapest.id;
}
