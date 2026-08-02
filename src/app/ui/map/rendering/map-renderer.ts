import { GameConfig } from '../../../config/game.config';
import { Faction } from '../../../models/faction.model';
import { Region, RegionPoint } from '../../../models/region.model';
import { SeaZone } from '../../../models/sea-zone.model';
import { UnitInstance } from '../../../models/unit-instance.model';
import { MapGeometry } from '../interaction/map-geometry';
import { MapPoint, UnitDragState, ViewTransform } from '../../../interfaces/map-types';
import { DRAG_GHOST_ICON_SIZE_PX } from './unit-icon-config';
import { UnitIconLookup, drawUnitCluster, drawUnitIcon } from './unit-icon-renderer';
import { drawInfluenceTokens } from './influence-token-renderer';
import { ActiveMapEffect, drawMapEffects } from './effects-renderer';
import { ActiveProjectile, drawProjectiles } from './projectile-renderer';
import { ActiveUnitMove, unitMovePosition } from './unit-move-renderer';
import { ActiveFlagTransition, FLAG_TRANSITION_DURATION_MS } from './flag-transition';

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
  /** Legal destinations for an armed click-to-place deploy/unload (GameStore.pendingAction) — highlighted the same as a drag's legal drop targets. */
  readonly pendingActionTargets: readonly string[];
  readonly activePlayerId: string | null;
  /** Instance ids of the active player's units that can act this movement phase (PROJECT_RULES.md sections 7/17). */
  readonly movableUnitIds: ReadonlySet<string>;
  /** Regions with an unresolved Attack Phase battle — only these are highlighted/clickable while phase === 'attack' (PROJECT_RULES.md sections 9-14). */
  readonly contestedRegionIds: ReadonlySet<string>;
  /** Declared-but-unfired Rocket System missile strikes (PROJECT_RULES.md section 15), launcher region -> target region, drawn as a trajectory line. */
  readonly missileStrikePreviews: readonly { readonly launcherRegionId: string; readonly targetRegionId: string }[];
  /** Currently-animating attack/casualty/cyber/deploy bursts (WorldMapComponent's local effect queue, spawned from GameStore.mapEffectEvents). */
  readonly activeEffects: readonly ActiveMapEffect[];
  /** Missiles currently in flight (FireMissileCommand), timed to land with a matching entry in activeEffects. */
  readonly activeProjectiles: readonly ActiveProjectile[];
  /** Units currently sliding from their previous region/sea-zone to their new one instead of popping instantly. */
  readonly activeUnitMoves: readonly ActiveUnitMove[];
  /** Regions currently crossfading from their previous owner's flag to the current one. */
  readonly activeFlagTransitions: Readonly<Record<string, ActiveFlagTransition>>;
  /** performance.now() at the moment this frame is being painted — every animation above computes its own elapsed time from it. */
  readonly now: number;
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

    // A unit currently sliding between regions (activeUnitMoves) is drawn
    // separately as a traveling ghost below — omit it from its destination's
    // cluster here so it doesn't pop in there before the slide finishes.
    const movingUnitIds = new Set(params.activeUnitMoves.map((move) => move.unitInstanceId));

    const moveTargets = params.draggingUnit?.moveDestinations ?? [];
    const attackTargets = params.draggingUnit?.attackTargets ?? [];
    for (const region of params.regions) {
      const isSelected = region.id === params.selectedId;
      const isNeighbor = params.neighborIds.includes(region.id);
      const isHovered = region.id === params.hoveredId;
      const isAttackDropTarget = attackTargets.includes(region.id);
      const isLegalDropTarget =
        isAttackDropTarget || moveTargets.includes(region.id) || params.pendingActionTargets.includes(region.id);
      const isContested = params.contestedRegionIds.has(region.id);
      const flagPath = params.flagPaths[region.id] ?? 'assets/flags/neutral.png';
      this.drawHotspot(
        context,
        region,
        flagPath,
        params.getFlagImage,
        params.factions,
        view.scale,
        params.now,
        params.activeFlagTransitions[region.id] ?? null,
        {
          isSelected,
          isNeighbor,
          isHovered,
          isLegalDropTarget,
          isAttackDropTarget,
          isContested,
        },
      );

      const units = params.unitsByRegion[region.id];
      if (units && units.length > 0) {
        const visibleUnits = movingUnitIds.size > 0 ? units.filter((unit) => !movingUnitIds.has(unit.id)) : units;
        const anchor = this.geometry.iconAnchorFor(region.id, params.regionsById, params.seaZonesById, view.scale);
        if (anchor && visibleUnits.length > 0) {
          drawUnitCluster(
            context,
            anchor.x,
            anchor.y,
            visibleUnits,
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
      const isAttackDropTarget = attackTargets.includes(seaZone.id);
      const isLegalDropTarget =
        isLoadTarget ||
        isAttackDropTarget ||
        moveTargets.includes(seaZone.id) ||
        params.pendingActionTargets.includes(seaZone.id);
      const isContested = params.contestedRegionIds.has(seaZone.id);
      this.drawSeaZoneMarker(context, seaZone, view.scale, params.now, {
        isSelected: seaZone.id === params.selectedId,
        isHovered: seaZone.id === params.hoveredId,
        isLegalDropTarget,
        isAttackDropTarget,
        isLoadTarget,
        isContested,
      });

      const units = params.unitsByRegion[seaZone.id];
      if (units && units.length > 0) {
        const visibleUnits = movingUnitIds.size > 0 ? units.filter((unit) => !movingUnitIds.has(unit.id)) : units;
        const anchor = this.geometry.iconAnchorFor(seaZone.id, params.regionsById, params.seaZonesById, view.scale);
        if (anchor && visibleUnits.length > 0) {
          drawUnitCluster(
            context,
            anchor.x,
            anchor.y,
            visibleUnits,
            params.factions,
            view.scale,
            params.getUnitIcon,
            params.movableUnitIds,
          );
        }
      }
    }

    for (const preview of params.missileStrikePreviews) {
      const from = params.regionsById[preview.launcherRegionId];
      const to = params.regionsById[preview.targetRegionId];
      if (from && to) {
        this.drawMissileTrajectory(context, from.position, to.position, view.scale);
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
        params.activePlayerId,
        color,
        view.scale,
        params.getUnitIcon,
      );
    }

    // A moving unit's ghost icon, drawn at its interpolated position — after
    // the normal clusters (so it's never hidden underneath one) but before
    // projectiles/effects (a missile flying past should still read on top).
    for (const move of params.activeUnitMoves) {
      const point = unitMovePosition(move, params.regionsById, params.seaZonesById, w, h, params.now);
      if (!point) {
        continue;
      }
      const unit = params.unitsByRegion[move.toRegionId]?.find((candidate) => candidate.id === move.unitInstanceId);
      if (!unit) {
        continue;
      }
      const color = params.factions[unit.ownerId]?.color ?? '#888888';
      drawUnitIcon(context, unit.unitId, point.x, point.y, DRAG_GHOST_ICON_SIZE_PX / view.scale, unit.ownerId, color, view.scale, params.getUnitIcon);
    }

    if (params.activeProjectiles.length > 0) {
      drawProjectiles(
        context,
        params.activeProjectiles,
        params.regionsById,
        params.seaZonesById,
        w,
        h,
        view.scale,
        params.now,
      );
    }

    // Drawn last so an attack/casualty/cyber/deploy burst always reads on
    // top of the region hotspot, units, and everything else underneath it.
    if (params.activeEffects.length > 0) {
      drawMapEffects(context, params.activeEffects, params.regionsById, params.seaZonesById, w, h, view.scale, params.now);
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
    now: number,
    flags: {
      isSelected: boolean;
      isHovered: boolean;
      isLegalDropTarget: boolean;
      isAttackDropTarget: boolean;
      isLoadTarget: boolean;
      isContested: boolean;
    },
  ): void {
    const w = this.config.mapViewBoxWidth;
    const h = this.config.mapViewBoxHeight;
    const cx = seaZone.position.x * w;
    const cy = seaZone.position.y * h;
    const radius = (this.config.seaZone.radiusFraction * h) / scale;

    // A load target (drop a unit here to board a transport) reads cyan; a
    // declared attack reads red (matching drawHotspot's land convention); a
    // plain move destination reads green; selection gold.
    context.beginPath();
    context.arc(cx, cy, radius, 0, Math.PI * 2);
    context.fillStyle = flags.isLoadTarget
      ? 'rgba(74, 200, 220, 0.35)'
      : flags.isAttackDropTarget
        ? 'rgba(192, 57, 43, 0.28)'
        : flags.isSelected
          ? 'rgba(79, 184, 224, 0.22)'
          : flags.isLegalDropTarget
            ? 'rgba(92, 184, 92, 0.28)'
            : flags.isHovered
              ? 'rgba(143, 180, 224, 0.2)'
              : 'rgba(74, 200, 220, 0.1)';
    context.fill();
    context.lineWidth = (flags.isSelected || flags.isLegalDropTarget ? 2.5 : flags.isHovered ? 2 : 1.2) / scale;
    context.strokeStyle = flags.isLoadTarget
      ? '#4ac8dc'
      : flags.isAttackDropTarget
        ? '#c0392b'
        : flags.isSelected
          ? '#4fb8e0'
          : flags.isLegalDropTarget
            ? '#5cb85c'
            : flags.isHovered
              ? '#8fb4e0'
              : 'rgba(74, 200, 220, 0.65)';
    context.stroke();

    // A pending Attack Phase battle in this sea zone (naval combat) — same
    // dashed danger-red marching-ants ring drawHotspot draws for land regions,
    // so a contested fleet reads as clickable/urgent exactly like a contested
    // land region does.
    if (flags.isContested) {
      context.save();
      const dashLength = 6 / scale;
      const gapLength = 4 / scale;
      context.setLineDash([dashLength, gapLength]);
      context.lineDashOffset = -(now / 40) % (dashLength + gapLength);
      context.lineWidth = 3 / scale;
      context.strokeStyle = '#b8433f';
      context.beginPath();
      context.arc(cx, cy, radius, 0, Math.PI * 2);
      context.stroke();
      context.restore();
    }

    context.fillStyle = flags.isSelected || flags.isHovered ? '#e6e9f0' : 'rgba(230, 233, 240, 0.75)';
    context.font = `${11 / scale}px Segoe UI, Roboto, sans-serif`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(seaZone.label, cx, cy + 0.5 / scale);
  }

  private drawHotspot(
    context: CanvasRenderingContext2D,
    region: Region,
    flagPath: string,
    getFlagImage: (path: string) => HTMLImageElement,
    factions: Readonly<Record<string, Faction>>,
    scale: number,
    now: number,
    flagTransition: ActiveFlagTransition | null,
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
    // captured region visibly shows its new owner's flag — crossfading from
    // the previous owner's flag for FLAG_TRANSITION_DURATION_MS right after
    // a capture, instead of swapping instantly.
    const elapsed = flagTransition ? now - flagTransition.startedAt : Infinity;
    if (flagTransition && elapsed >= 0 && elapsed < FLAG_TRANSITION_DURATION_MS) {
      const t = elapsed / FLAG_TRANSITION_DURATION_MS;
      const previousPath = flagTransition.previousOwnerId
        ? `assets/flags/${flagTransition.previousOwnerId}.png`
        : 'assets/flags/neutral.png';
      const previousImage = getFlagImage(previousPath);
      const currentImage = getFlagImage(flagPath);
      context.save();
      if (previousImage.complete && previousImage.naturalWidth > 0) {
        context.globalAlpha = 1 - t;
        context.drawImage(previousImage, left, top, boxWidth, boxHeight);
      }
      if (currentImage.complete && currentImage.naturalWidth > 0) {
        context.globalAlpha = t;
        context.drawImage(currentImage, left, top, boxWidth, boxHeight);
      }
      context.restore();
    } else {
      const flagImage = getFlagImage(flagPath);
      if (flagImage.complete && flagImage.naturalWidth > 0) {
        context.drawImage(flagImage, left, top, boxWidth, boxHeight);
      } else {
        context.fillStyle = '#111319';
        context.fillRect(left, top, boxWidth, boxHeight);
      }
    }

    context.lineWidth = (flags.isSelected || flags.isLegalDropTarget ? 3 : flags.isNeighbor ? 2 : 1) / scale;
    context.strokeStyle = flags.isSelected
      ? '#4fb8e0'
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
    // spot which regions still need combat resolved at a glance. The dashes
    // "march" (animated offset driven by `now`) so a contested region reads
    // as urgent/ongoing rather than a static decoration.
    if (flags.isContested) {
      context.fillStyle = 'rgba(184, 67, 63, 0.22)';
      context.fillRect(left, top, boxWidth, boxHeight);
      context.save();
      const dashLength = 6 / scale;
      const gapLength = 4 / scale;
      context.setLineDash([dashLength, gapLength]);
      context.lineDashOffset = -(now / 40) % (dashLength + gapLength);
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

  /**
   * A dashed orange line + arrowhead from a Rocket System's region to the
   * region it declared a missile strike on (PROJECT_RULES.md section 15) —
   * the launcher itself never moves, so this is the only visible sign of
   * the pending strike until its battle opens in the Attack Phase.
   */
  private drawMissileTrajectory(
    context: CanvasRenderingContext2D,
    fromPoint: RegionPoint,
    toPoint: RegionPoint,
    scale: number,
  ): void {
    const w = this.config.mapViewBoxWidth;
    const h = this.config.mapViewBoxHeight;
    const fromX = fromPoint.x * w;
    const fromY = fromPoint.y * h;
    const toX = toPoint.x * w;
    const toY = toPoint.y * h;
    const color = '#4fb8e0';

    context.save();
    context.setLineDash([8 / scale, 6 / scale]);
    context.lineWidth = 2 / scale;
    context.strokeStyle = color;
    context.beginPath();
    context.moveTo(fromX, fromY);
    context.lineTo(toX, toY);
    context.stroke();
    context.restore();

    const angle = Math.atan2(toY - fromY, toX - fromX);
    const arrowLength = 12 / scale;
    context.save();
    context.fillStyle = color;
    context.beginPath();
    context.moveTo(toX, toY);
    context.lineTo(
      toX - arrowLength * Math.cos(angle - Math.PI / 6),
      toY - arrowLength * Math.sin(angle - Math.PI / 6),
    );
    context.lineTo(
      toX - arrowLength * 0.6 * Math.cos(angle),
      toY - arrowLength * 0.6 * Math.sin(angle),
    );
    context.lineTo(
      toX - arrowLength * Math.cos(angle + Math.PI / 6),
      toY - arrowLength * Math.sin(angle + Math.PI / 6),
    );
    context.closePath();
    context.fill();
    context.restore();
  }
}
