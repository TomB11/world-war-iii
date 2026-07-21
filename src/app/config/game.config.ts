/**
 * Technical/rendering configuration. Gameplay balance values are never
 * placed here — they live in JSON (PROJECT_RULES.md section 30).
 */
export interface GameConfig {
  readonly mapImagePath: string;
  /** Matches the source map image's aspect ratio (3968x2050). */
  readonly mapViewBoxWidth: number;
  readonly mapViewBoxHeight: number;
  /**
   * Hotspot size, measured directly off the flag icons in the source map
   * image, as a fraction of map width/height. The hotspot is drawn as a
   * filled square over the flag so that changing a region's owner visibly
   * "replaces" the flag with the new controller's color.
   */
  readonly hotspot: {
    readonly widthFraction: number;
    readonly heightFraction: number;
    /**
     * Extra vertical clearance (fraction of map height) below the hotspot
     * before unit markers start, so they don't overlap the region name
     * baked into the map background image just under the flag.
     */
    readonly unitMarkerOffsetFraction: number;
  };
  /** Sea zone marker: a big, mostly-transparent, clickable circle with its number centered. */
  readonly seaZone: {
    readonly radiusFraction: number;
  };
  readonly zoom: {
    readonly min: number;
    readonly max: number;
    readonly step: number;
  };
}

export const GAME_CONFIG: GameConfig = {
  mapImagePath: 'assets/maps/world-map.png',
  mapViewBoxWidth: 1200,
  mapViewBoxHeight: 620,
  hotspot: {
    widthFraction: 0.0140,
    heightFraction: 0.028,
    unitMarkerOffsetFraction: 0.014,
  },
  seaZone: {
    radiusFraction: 0.024,
  },
  zoom: {
    min: 1,
    max: 6,
    step: 0.0015,
  },
};
