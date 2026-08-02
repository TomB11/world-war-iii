import { Region } from '../../../models/region.model';
import { SeaZone } from '../../../models/sea-zone.model';

/** One unit's plain move/attack move/naval reposition, still sliding from its origin to its new (already-current-in-state) location. */
export interface ActiveUnitMove {
  readonly id: number;
  readonly unitInstanceId: string;
  readonly fromRegionId: string;
  readonly toRegionId: string;
  readonly startedAt: number;
}

export const UNIT_MOVE_DURATION_MS = 420;

/**
 * Where this in-flight move's icon should be drawn right now (map-unit pixel
 * space) — null once its endpoints can't be resolved or its duration has
 * elapsed, at which point the unit reverts to being drawn normally as part
 * of its destination's regular cluster. Eases out (decelerates into the
 * destination) rather than arriving at a constant speed.
 */
export function unitMovePosition(
  move: ActiveUnitMove,
  regionsById: Readonly<Record<string, Region>>,
  seaZonesById: Readonly<Record<string, SeaZone>>,
  mapWidth: number,
  mapHeight: number,
  now: number,
): { x: number; y: number } | null {
  const from = regionsById[move.fromRegionId]?.position ?? seaZonesById[move.fromRegionId]?.position;
  const to = regionsById[move.toRegionId]?.position ?? seaZonesById[move.toRegionId]?.position;
  if (!from || !to) {
    return null;
  }
  const elapsed = now - move.startedAt;
  if (elapsed < 0 || elapsed > UNIT_MOVE_DURATION_MS) {
    return null;
  }
  const linear = elapsed / UNIT_MOVE_DURATION_MS;
  const eased = 1 - (1 - linear) * (1 - linear);
  return {
    x: (from.x + (to.x - from.x) * eased) * mapWidth,
    y: (from.y + (to.y - from.y) * eased) * mapHeight,
  };
}
