import { GameConfig } from '../../../config/game.config';
import { Region, RegionPoint } from '../../../models/region.model';
import { SeaZone } from '../../../models/sea-zone.model';
import { UnitInstance } from '../../../models/unit-instance.model';
import { MapPoint, ViewTransform } from '../../../interfaces/map-types';
import { IconLayoutEntry, layoutUnitIcons } from '../rendering/unit-icon-renderer';
import { UNIT_ICON_SIZE_PX } from '../rendering/unit-icon-config';

const SEA_ZONE_ICON_CLEARANCE_PX = 3;
const UNIT_ICON_HIT_RADIUS_FACTOR = 0.7;

/**
 * All map coordinate conversion and click/hover hit-testing in one place:
 * screen <-> world point conversion, "what region/sea-zone/unit-icon is
 * under this point". Pure geometry — no game-state mutation, no rendering.
 */
export class MapGeometry {
  constructor(private readonly config: GameConfig) {}

  /** Converts a pointer event's client coords to a normalized (0..1) map point, accounting for pan/zoom. */
  toWorldPoint(canvas: HTMLCanvasElement, clientX: number, clientY: number, view: ViewTransform): RegionPoint {
    const rect = canvas.getBoundingClientRect();
    const screenX = ((clientX - rect.left) / rect.width) * this.config.mapViewBoxWidth;
    const screenY = ((clientY - rect.top) / rect.height) * this.config.mapViewBoxHeight;
    const worldX = (screenX - view.panX) / view.scale;
    const worldY = (screenY - view.panY) / view.scale;
    return {
      x: worldX / this.config.mapViewBoxWidth,
      y: worldY / this.config.mapViewBoxHeight,
    };
  }

  hitTestRegion(regions: readonly Region[], point: RegionPoint): Region | null {
    const halfW = this.config.hotspot.widthFraction / 2;
    const halfH = this.config.hotspot.heightFraction / 2;
    for (const region of regions) {
      const dx = Math.abs(region.position.x - point.x);
      const dy = Math.abs(region.position.y - point.y);
      if (dx <= halfW && dy <= halfH) {
        return region;
      }
    }
    return null;
  }

  hitTestSeaZone(seaZones: readonly SeaZone[], point: RegionPoint, scale: number): SeaZone | null {
    const w = this.config.mapViewBoxWidth;
    const h = this.config.mapViewBoxHeight;
    // Matches drawSeaZoneMarker's radius exactly: the circle keeps a constant
    // on-screen size regardless of zoom, so its world-space radius shrinks
    // as scale grows — the hit test must shrink the same way or it'll accept
    // clicks well outside the visible circle when zoomed in.
    const radius = (this.config.seaZone.radiusFraction * h) / scale;
    const px = point.x * w;
    const py = point.y * h;
    for (const seaZone of seaZones) {
      const dx = seaZone.position.x * w - px;
      const dy = seaZone.position.y * h - py;
      if (Math.hypot(dx, dy) <= radius) {
        return seaZone;
      }
    }
    return null;
  }

  /**
   * Map-unit-space anchor point for a location's unit icon cluster. Land
   * regions with an explicit `iconAnchor` (see Region model) are centered
   * there exactly, no further offset — that point was hand-placed to sit
   * inside the region's landmass. Everything else falls back to a small
   * clearance below the flag box, or below the sea-zone circle.
   */
  iconAnchorFor(
    locationId: string,
    regions: Readonly<Record<string, Region>>,
    seaZones: Readonly<Record<string, SeaZone>>,
    scale: number,
  ): MapPoint | null {
    const w = this.config.mapViewBoxWidth;
    const h = this.config.mapViewBoxHeight;
    const iconSize = UNIT_ICON_SIZE_PX / scale;

    const region = regions[locationId];
    if (region) {
      if (region.iconAnchor) {
        return { x: region.iconAnchor.x * w, y: region.iconAnchor.y * h };
      }
      const cx = region.position.x * w;
      const cy = region.position.y * h;
      const boxHeight = this.config.hotspot.heightFraction * h;
      const clearance = this.config.hotspot.unitMarkerOffsetFraction * h;
      return { x: cx, y: cy + boxHeight / 2 + clearance + iconSize / 2 };
    }

    const seaZone = seaZones[locationId];
    if (seaZone) {
      const cx = seaZone.position.x * w;
      const cy = seaZone.position.y * h;
      const radius = (this.config.seaZone.radiusFraction * h) / scale;
      const clearance = SEA_ZONE_ICON_CLEARANCE_PX / scale;
      return { x: cx, y: cy + radius + clearance + iconSize / 2 };
    }

    return null;
  }

  /** Finds the unit-icon group under a click/pointer point, across every region and sea zone. */
  hitTestUnitIcon(
    point: RegionPoint,
    unitsByRegion: Readonly<Record<string, readonly UnitInstance[]>>,
    regions: Readonly<Record<string, Region>>,
    seaZones: Readonly<Record<string, SeaZone>>,
    scale: number,
  ): { entry: IconLayoutEntry; units: readonly UnitInstance[]; originId: string } | null {
    const w = this.config.mapViewBoxWidth;
    const h = this.config.mapViewBoxHeight;
    const px = point.x * w;
    const py = point.y * h;
    const iconSize = UNIT_ICON_SIZE_PX / scale;
    const hitRadius = iconSize * UNIT_ICON_HIT_RADIUS_FACTOR;

    for (const [locationId, units] of Object.entries(unitsByRegion)) {
      if (units.length === 0) {
        continue;
      }
      const anchor = this.iconAnchorFor(locationId, regions, seaZones, scale);
      if (!anchor) {
        continue;
      }
      const layout = layoutUnitIcons(anchor.x, anchor.y, units, scale);
      for (const entry of layout) {
        if (Math.hypot(entry.x - px, entry.y - py) <= hitRadius) {
          return { entry, units, originId: locationId };
        }
      }
    }
    return null;
  }
}
