/**
 * A Region is a single land territory on the world map.
 * All values are loaded from data/countries.json — never hardcoded.
 *
 * The map is rendered as a real background image (see GAME_CONFIG /
 * WorldMapComponent) with a clickable hotspot per region rather than
 * hand-traced coastline polygons. `position` is a normalized (0..1)
 * fraction of the map image's width/height, and the hotspot's click/hover
 * tolerance is a fixed radius defined in GAME_CONFIG.
 */
export interface Region {
  readonly id: string;
  readonly name: string;
  readonly ownerId: string | null;
  /** Income contributed to its owner's treasury each Income Phase. */
  readonly value: number;
  /** Production capacity (units buildable here). 0 = no factory. */
  readonly factory: number;
  /** Whether this region counts toward the white-star victory condition (PROJECT_RULES.md section 2). */
  readonly isVictoryStar: boolean;
  readonly neighbors: readonly string[];
  readonly position: RegionPoint;
  /**
   * Optional override for where unit icons are centered, when the default
   * (near `position`, just below the flag) drifts outside this region's
   * actual landmass in the map artwork — the map has no traced region
   * polygons to clip against, so this is a manual per-region escape hatch
   * rather than something computed. Omit unless a region's icons visibly
   * spill onto the ocean or a neighboring territory.
   */
  readonly iconAnchor?: RegionPoint;
  /**
   * Political Influence tokens per faction id, keyed only for factions with
   * at least one token here (PROJECT_RULES.md section 6). Only meaningful
   * on neutral (ownerId === null) regions — force-captured/starting-owned
   * regions never accumulate tokens.
   */
  readonly influenceTokens?: Readonly<Record<string, number>>;
}

export interface RegionPoint {
  readonly x: number;
  readonly y: number;
}
