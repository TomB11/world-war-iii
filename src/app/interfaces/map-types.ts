/** Current pan/zoom of the map canvas. */
export interface ViewTransform {
  readonly scale: number;
  readonly panX: number;
  readonly panY: number;
}

/** A point in map-unit pixel space (0..mapViewBoxWidth/Height) — NOT the normalized 0..1 RegionPoint. */
export interface MapPoint {
  readonly x: number;
  readonly y: number;
}

/**
 * Tracks an in-progress unit drag (pick up -> drop on a legal destination).
 * The two destination sets are disjoint: dropping on a moveDestination does
 * a plain move, dropping on an attackTarget declares an attack (moving into
 * an enemy region — only populated during the Attack Moves phase). Which
 * action fires is decided by the drop target, not at pickup.
 */
export interface UnitDragState {
  readonly unitInstanceId: string;
  readonly unitId: string;
  readonly originId: string;
  readonly moveDestinations: readonly string[];
  readonly attackTargets: readonly string[];
  /** Sea-zone ids that would load this unit onto a transport there (seaZoneId -> transportId). */
  readonly loadTargets: ReadonlyMap<string, string>;
}
