import { RegionPoint } from './region.model';

/**
 * A SeaZone is one numbered ocean area on the map background (data/sea-zones.json),
 * digitized from the board's printed zone numbers. Positions and adjacency are a
 * best-effort reading of the map image, pending visual verification in-game
 * (see README "Sea zones" section) — treat as a first draft, not ground truth.
 */
export interface SeaZone {
  readonly id: string;
  /** The number printed on the map, e.g. "14". */
  readonly label: string;
  readonly position: RegionPoint;
  /** Other sea zones reachable in one hop. */
  readonly neighbors: readonly string[];
  /** Land regions bordering this zone (coastal link points for naval movement/transport). */
  readonly adjacentRegionIds: readonly string[];
}
