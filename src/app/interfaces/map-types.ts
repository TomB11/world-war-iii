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

/**
 * One attack/casualty/cyber/deploy moment GameStore's applyEvents recorded
 * for the map to animate at regionId (ui/map/rendering/effects-renderer.ts —
 * `kind` picks which burst: 'explosion', 'glitch', or 'spawn'). `id` is a
 * monotonically increasing counter, not a GameState field: purely cosmetic,
 * so WorldMapComponent can tell which queue entries it has already turned
 * into a local ActiveMapEffect without it ever touching engine state.
 */
export interface MapEffectEvent {
  readonly id: number;
  readonly regionId: string;
  readonly kind: 'explosion' | 'glitch' | 'spawn';
}

/** One unit's plain move/attack move/naval reposition GameStore's applyEvents recorded for the map to animate as a sliding icon (ui/map/rendering/unit-move-renderer.ts) instead of popping instantly to its new region. */
export interface UnitMoveQueueEntry {
  readonly id: number;
  readonly unitInstanceId: string;
  readonly fromRegionId: string;
  readonly toRegionId: string;
}

/** A missile just fired (FireMissileCommand) — queued for the map to animate a projectile from launcherRegionId to regionId (ui/map/rendering/projectile-renderer.ts). */
export interface MissileFiredQueueEntry {
  readonly id: number;
  readonly launcherRegionId: string;
  readonly regionId: string;
}

/** A region just changed hands (RegionCaptured) — queued for the map to crossfade its flag instead of swapping instantly (ui/map/rendering/flag-transition.ts). */
export interface FlagTransitionQueueEntry {
  readonly id: number;
  readonly regionId: string;
  readonly previousOwnerId: string | null;
}
