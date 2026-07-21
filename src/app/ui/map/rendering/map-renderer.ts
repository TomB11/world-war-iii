import { GameConfig } from '../../../config/game.config';
import { Faction } from '../../../models/faction.model';
import { Region } from '../../../models/region.model';
import { SeaZone } from '../../../models/sea-zone.model';
import { UnitInstance } from '../../../models/unit-instance.model';
import { MapGeometry } from '../interaction/map-geometry';
import { MapPoint, UnitDragState, ViewTransform } from '../../../interfaces/map-types';
import { DRAG_GHOST_ICON_SIZE_PX } from './unit-icon-config';
import { UnitIconLookup, drawUnitCluster, drawUnitIcon } from './unit-icon-renderer';
import { drawInfluenceTokens } from './influence-token-renderer';

export interface MapDrawParams {
  readonly context: CanvasRenderingContext2D;
  readonly view: ViewTransform;
  readonly mapImage: HTMLImageElement | null;
  readonly mapImageLoaded: boolean;
  readonly regions: readonly Region[];
  readonly regionsById: Readonly<Record<string, Region>>;
  readonly flagPaths: Readonly<Record<string, string>>;
  readonly selectedId: string | null;
  readonly neighborIds: readonly string[];
  readonly hoveredId: string | null;
  readonly seaZones: readonly SeaZone[];
  readonly seaZonesById: Readonly<Record<string, SeaZone>>;
  readonly unitsByRegion: Readonly<Record<string, readonly UnitInstance[]>>;
  readonly factions: Readonly<Record<string, Faction>>;
  readonly draggingUnit: UnitDragState | null;
  readonly dragPointerPoint: MapPoint | null;
  readonly activePlayerId: string | null;
  /** Instance ids of the active player's units that can act this movement phase (PROJECT_RULES.md sections 7/17). */
  readonly movableUnitIds: ReadonlySet<string>;
  /** Regions with an unresolved Attack Phase battle — only these are highlighted/clickable while phase === 'attack' (PROJECT_RULES.md sections 9-14). */
  readonly contestedRegionIds: ReadonlySet<string>;
  readonly getFlagImage: (path: string) => HTMLImageElement;
  readonly getUnitIcon: UnitIconLookup;
}

/**
 * Paints one frame of the world map: background image, region hotspots
 * (flags + selection/hover/drop-target highlight), sea zone markers, unit
 * icon clusters, and the drag ghost icon. No game-state mutation, no input
 * handling — WorldMapComponent owns the canvas/pointer wiring and calls
 * draw() with a fresh snapshot whenever something changes.
 */
export class MapRenderer {
  constructor(
    private readonly config: GameConfig,
    private readonly geometry: MapGeometry,
  ) {}

  draw(params: MapDrawParams): void {
    const { context, view } = params;
    const w = this.config.mapViewBoxWidth;
    const h = this.config.mapViewBoxHeight;
    context.clearRect(0, 0, w, h);

    context.save();
    context.translate(view.panX, view.panY);
    context.scale(view.scale, view.scale);

    if (params.mapImageLoaded && params.mapImage) {
      context.drawImage(params.mapImage, 0, 0, w, h);
    } else {
      context.fillStyle = '#0b0e14';
      context.fillRect(0, 0, w, h);
    }

    const moveTargets = params.draggingUnit?.moveDestinations ?? [];
    const attackTargets = params.draggingUnit?.attackTargets ?? [];
    for (const region of params.regions) {
      const isSelected = region.id === params.selectedId;
      const isNeighbor = params.neighborIds.includes(region.id);
      const isHovered = region.id === params.hoveredId;
      const isAttackDropTarget = attackTargets.includes(region.id);
      const isLegalDropTarget = isAttackDropTarget || moveTargets.includes(region.id);
      const isContested = params.contestedRegionIds.has(region.id);
      const flagPath = params.flagPaths[region.id] ?? 'assets/flags/neutral.png';
      this.drawHotspot(context, region, params.getFlagImage(flagPath), params.factions, view.scale, {
        isSelected,
        isNeighbor,
        isHovered,
        isLegalDropTarget,
        isAttackDropTarget,
        isContested,
      });

      const units = params.unitsByRegion[region.id];
      if (units && units.length > 0) {
        const anchor = this.geometry.iconAnchorFor(region.id, params.regionsById, params.seaZonesById, view.scale);
        if (anchor) {
          drawUnitCluster(
            context,
            anchor.x,
            anchor.y,
            units,
            params.factions,
            view.scale,
            params.getUnitIcon,
            params.movableUnitIds,
          );
        }
      }
    }

    const loadTargets = params.draggingUnit?.loadTargets;
    for (const seaZone of params.seaZones) {
      const isLoadTarget = loadTargets?.has(seaZone.id) ?? false;
      const isLegalDropTarget = isLoadTarget || moveTargets.includes(seaZone.id);
      this.drawSeaZoneMarker(context, seaZone, view.scale, {
        isSelected: seaZone.id === params.selectedId,
        isHovered: seaZone.id === params.hoveredId,
        isLegalDropTarget,
        isLoadTarget,
      });

      const units = params.unitsByRegion[seaZone.id];
      if (units && units.length > 0) {
        const anchor = this.geometry.iconAnchorFor(seaZone.id, params.regionsById, params.seaZonesById, view.scale);
        if (anchor) {
          drawUnitCluster(
            context,
            anchor.x,
            anchor.y,
            units,
            params.factions,
            view.scale,
            params.getUnitIcon,
            params.movableUnitIds,
          );
        }
      }
    }

    if (params.draggingUnit && params.dragPointerPoint) {
      const color = params.factions[params.activePlayerId ?? '']?.color ?? '#888888';
      drawUnitIcon(
        context,
        params.draggingUnit.unitId,
        params.dragPointerPoint.x,
        params.dragPointerPoint.y,
        DRAG_GHOST_ICON_SIZE_PX / view.scale,
        color,
        view.scale,
        params.getUnitIcon,
      );
    }

    context.restore();
  }

  /**
   * Clickable sea zone selector: a big, mostly-transparent circle with its
   * printed number centered inside, so it reads as a selectable region
   * without hiding the map artwork underneath. Brightens on hover/selection,
   * same visual language as land region hotspots.
   */
  private drawSeaZoneMarker(
    context: CanvasRenderingContext2D,
    seaZone: SeaZone,
    scale: number,
    flags: { isSelected: boolean; isHovered: boolean; isLegalDropTarget: boolean; isLoadTarget: boolean },
  ): void {
    const w = this.config.mapViewBoxWidth;
    const h = this.config.mapViewBoxHeight;
    const cx = seaZone.position.x * w;
    const cy = seaZone.position.y * h;
    const radius = (this.config.seaZone.radiusFraction * h) / scale;

    // A load target (drop a unit here to board a transport) reads cyan; a
    // plain move destination reads green; selection gold.
    context.beginPath();
    context.arc(cx, cy, radius, 0, Math.PI * 2);
    context.fillStyle = flags.isLoadTarget
      ? 'rgba(74, 200, 220, 0.35)'
      : flags.isSelected
        ? 'rgba(224, 172, 77, 0.22)'
        : flags.isLegalDropTarget
          ? 'rgba(92, 184, 92, 0.28)'
          : flags.isHovered
            ? 'rgba(143, 180, 224, 0.2)'
            : 'rgba(74, 200, 220, 0.1)';
    context.fill();
    context.lineWidth = (flags.isSelected || flags.isLegalDropTarget ? 2.5 : flags.isHovered ? 2 : 1.2) / scale;
    context.strokeStyle = flags.isLoadTarget
      ? '#4ac8dc'
      : flags.isSelected
        ? '#e0ac4d'
        : flags.isLegalDropTarget
          ? '#5cb85c'
          : flags.isHovered
            ? '#8fb4e0'
            : 'rgba(74, 200, 220, 0.65)';
    context.stroke();

    context.fillStyle = flags.isSelected || flags.isHovered ? '#e6e9f0' : 'rgba(230, 233, 240, 0.75)';
    context.font = `${11 / scale}px Segoe UI, Roboto, sans-serif`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(seaZone.label, cx, cy + 0.5 / scale);
  }

  private drawHotspot(
    context: CanvasRenderingContext2D,
    region: Region,
    flagImage: HTMLImageElement,
    factions: Readonly<Record<string, Faction>>,
    scale: number,
    flags: {
      isSelected: boolean;
      isNeighbor: boolean;
      isHovered: boolean;
      isLegalDropTarget: boolean;
      isAttackDropTarget: boolean;
      isContested: boolean;
    },
  ): void {
    const w = this.config.mapViewBoxWidth;
    const h = this.config.mapViewBoxHeight;
    const cx = region.position.x * w;
    const cy = region.position.y * h;
    const boxWidth = this.config.hotspot.widthFraction * w;
    const boxHeight = this.config.hotspot.heightFraction * h;
    const left = cx - boxWidth / 2;
    const top = cy - boxHeight / 2;

    // A legal drop target while dragging: green for a plain move, red for a
    // declared attack (so drag-to-attack reads clearly as hostile).
    const dropStroke = flags.isAttackDropTarget ? '#c0392b' : '#5cb85c';
    const dropFill = flags.isAttackDropTarget ? 'rgba(192, 57, 43, 0.25)' : 'rgba(92, 184, 92, 0.22)';

    // Draw the owner's actual flag image over the flag icon baked into the
    // map background. Redrawn every time regionFlagPaths() changes, so a
    // captured region visibly shows its new owner's flag.
    if (flagImage.complete && flagImage.naturalWidth > 0) {
      context.drawImage(flagImage, left, top, boxWidth, boxHeight);
    } else {
      context.fillStyle = '#111319';
      context.fillRect(left, top, boxWidth, boxHeight);
    }

    context.lineWidth = (flags.isSelected || flags.isLegalDropTarget ? 3 : flags.isNeighbor ? 2 : 1) / scale;
    context.strokeStyle = flags.isSelected
      ? '#e0ac4d'
      : flags.isLegalDropTarget
        ? dropStroke
        : flags.isNeighbor
          ? '#8fb4e0'
          : '#0b0e14';
    context.strokeRect(left, top, boxWidth, boxHeight);

    if (flags.isLegalDropTarget) {
      context.fillStyle = dropFill;
      context.fillRect(left, top, boxWidth, boxHeight);
    }

    if (flags.isHovered) {
      context.fillStyle = 'rgba(255, 255, 255, 0.25)';
      context.fillRect(left, top, boxWidth, boxHeight);
    }

    // A pending Attack Phase battle (PROJECT_RULES.md sections 9-14): a
    // dashed danger-red ring on top of everything else, so the player can
    // spot which regions still need combat resolved at a glance.
    if (flags.isContested) {
      context.fillStyle = 'rgba(184, 67, 63, 0.22)';
      context.fillRect(left, top, boxWidth, boxHeight);
      context.save();
      context.setLineDash([6 / scale, 4 / scale]);
      context.lineWidth = 3 / scale;
      context.strokeStyle = '#b8433f';
      context.strokeRect(left, top, boxWidth, boxHeight);
      context.restore();
    }

    if (flags.isSelected || flags.isHovered || flags.isNeighbor || flags.isLegalDropTarget || flags.isContested) {
      context.fillStyle = '#e6e9f0';
      context.font = `${11 / scale}px Segoe UI, Roboto, sans-serif`;
      context.textAlign = 'center';
      context.textBaseline = 'bottom';
      context.fillText(region.name, cx, top - 3 / scale);
    }

    drawInfluenceTokens(context, region, left + boxWidth, cy, factions, scale);
  }
}
