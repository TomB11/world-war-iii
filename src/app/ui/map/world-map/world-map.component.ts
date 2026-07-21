import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  effect,
  inject,
  viewChild,
} from '@angular/core';
import { GameStore } from '../../../state/store';
import { GAME_CONFIG } from '../../../config/game.config';
import { RegionPoint } from '../../../models/region.model';
import { MOVEMENT_PHASES } from '../../../core/constants/game.constants';
import { MapGeometry } from '../interaction/map-geometry';
import { MapRenderer } from '../rendering/map-renderer';
import { UnitIconImageCache } from '../rendering/unit-icon-images';
import { MapPoint, UnitDragState, ViewTransform } from '../../../interfaces/map-types';

const CLICK_DRAG_THRESHOLD_PX = 4;

/**
 * Pure rendering + input component. It never mutates game state itself —
 * every click/drag is translated into a GameStore call, which is the only
 * gateway to Command -> Engine -> State (CODING_STANDARDS.md section 3).
 *
 * This component only owns the canvas element and the pointer/pan/zoom/drag
 * state machine. Actual pixel painting lives in MapRenderer (ui/map/rendering)
 * and hit-testing/coordinate math lives in MapGeometry (ui/map/interaction) —
 * see those files to change how the map looks or how clicks are resolved.
 * Unit icon sizing lives in ui/map/rendering/unit-icon-config.ts.
 */
@Component({
  selector: 'wwiii-world-map',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './world-map.component.html',
  styleUrl: './world-map.component.scss',
})
export class WorldMapComponent implements AfterViewInit, OnDestroy {
  private readonly canvasRef = viewChild.required<ElementRef<HTMLCanvasElement>>('mapCanvas');

  protected readonly config = GAME_CONFIG;
  protected readonly store = inject(GameStore);

  private readonly geometry = new MapGeometry(this.config);
  private readonly renderer = new MapRenderer(this.config, this.geometry);
  private readonly unitIconImages = new UnitIconImageCache(() => this.redrawCurrentState());

  private context: CanvasRenderingContext2D | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private mapImage: HTMLImageElement | null = null;
  private mapImageLoaded = false;
  private readonly flagImages = new Map<string, HTMLImageElement>();

  private view: ViewTransform = { scale: 1, panX: 0, panY: 0 };
  private isPointerDown = false;
  private isDragging = false;
  private suppressNextClick = false;
  private lastPointerX = 0;
  private lastPointerY = 0;
  private pointerDownX = 0;
  private pointerDownY = 0;

  /** Set while a unit icon is being dragged; distinct from map-panning. */
  private draggingUnit: UnitDragState | null = null;
  /** Current pointer position (map-unit space) while dragging a unit, for the ghost icon. */
  private dragPointerPoint: MapPoint | null = null;

  constructor() {
    // Redraw whenever any signal this reads changes: regions, flags,
    // selection, hover. This is the only place engine state becomes pixels.
    effect(() => {
      this.store.regions();
      this.store.regionFlagPaths();
      this.store.selectedRegionId();
      this.store.neighborIds();
      this.store.hoveredRegionId();
      this.store.seaZones();
      this.store.unitsByRegion();
      this.store.factions();
      this.store.movableUnitIds();
      this.store.contestedRegionIds();
      this.redrawCurrentState();
    });
  }

  ngAfterViewInit(): void {
    this.context = this.canvasRef().nativeElement.getContext('2d');
    this.resizeObserver = new ResizeObserver(() => this.syncCanvasResolution());
    this.resizeObserver.observe(this.canvasRef().nativeElement);
    this.syncCanvasResolution();
    this.loadMapImage();
  }

  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
  }

  protected resetView(): void {
    this.view = { scale: 1, panX: 0, panY: 0 };
    this.redrawCurrentState();
  }

  protected onCanvasClick(event: MouseEvent): void {
    if (this.suppressNextClick) {
      this.suppressNextClick = false;
      return;
    }
    const point = this.toWorldPoint(event.clientX, event.clientY);
    const region = this.geometry.hitTestRegion(Object.values(this.store.regions()), point);

    // During the Attack Phase, only regions with a pending battle respond to
    // clicks — clicking one opens the combat board; everything else on the
    // map (other regions, sea zones, empty space) is a no-op, since there's
    // nothing to select or move (PROJECT_RULES.md sections 9-14).
    if (this.store.state()?.phase === 'attack') {
      if (region && this.store.contestedRegionIds().has(region.id)) {
        this.store.openCombat(region.id);
      }
      return;
    }

    if (region) {
      this.store.selectRegion(region.id);
      return;
    }
    const seaZone = this.geometry.hitTestSeaZone(Object.values(this.store.seaZones()), point, this.view.scale);
    if (seaZone) {
      this.store.selectRegion(seaZone.id);
      return;
    }
    this.store.clearSelection();
  }

  protected onCanvasWheel(event: WheelEvent): void {
    event.preventDefault();
    const canvas = this.canvasRef().nativeElement;
    const rect = canvas.getBoundingClientRect();
    const screenX = ((event.clientX - rect.left) / rect.width) * this.config.mapViewBoxWidth;
    const screenY = ((event.clientY - rect.top) / rect.height) * this.config.mapViewBoxHeight;

    const worldX = (screenX - this.view.panX) / this.view.scale;
    const worldY = (screenY - this.view.panY) / this.view.scale;

    const zoomFactor = Math.exp(-event.deltaY * this.config.zoom.step);
    const newScale = clamp(this.view.scale * zoomFactor, this.config.zoom.min, this.config.zoom.max);

    this.view = {
      scale: newScale,
      panX: screenX - worldX * newScale,
      panY: screenY - worldY * newScale,
    };
    this.redrawCurrentState();
  }

  protected onPointerDown(event: PointerEvent): void {
    const point = this.toWorldPoint(event.clientX, event.clientY);
    const pickup = this.tryPickUpUnit(point);
    if (pickup) {
      this.draggingUnit = pickup;
      this.dragPointerPoint = { x: point.x * this.config.mapViewBoxWidth, y: point.y * this.config.mapViewBoxHeight };
      this.setPointerCaptureSafely(event.pointerId);
      this.canvasRef().nativeElement.classList.add('unit-dragging');
      this.redrawCurrentState();
      return;
    }

    this.isPointerDown = true;
    this.isDragging = false;
    this.lastPointerX = event.clientX;
    this.lastPointerY = event.clientY;
    this.pointerDownX = event.clientX;
    this.pointerDownY = event.clientY;
    this.setPointerCaptureSafely(event.pointerId);
  }

  protected onPointerMove(event: PointerEvent): void {
    if (this.draggingUnit) {
      const point = this.toWorldPoint(event.clientX, event.clientY);
      this.dragPointerPoint = { x: point.x * this.config.mapViewBoxWidth, y: point.y * this.config.mapViewBoxHeight };
      this.redrawCurrentState();
      return;
    }

    if (!this.isPointerDown) {
      const point = this.toWorldPoint(event.clientX, event.clientY);
      const region = this.geometry.hitTestRegion(Object.values(this.store.regions()), point);
      if (region) {
        this.store.setHoveredRegion(region.id);
      } else {
        const seaZone = this.geometry.hitTestSeaZone(Object.values(this.store.seaZones()), point, this.view.scale);
        this.store.setHoveredRegion(seaZone ? seaZone.id : null);
      }
      return;
    }

    const movedX = event.clientX - this.pointerDownX;
    const movedY = event.clientY - this.pointerDownY;
    if (!this.isDragging && Math.hypot(movedX, movedY) > CLICK_DRAG_THRESHOLD_PX) {
      this.isDragging = true;
      this.canvasRef().nativeElement.classList.add('is-panning');
    }

    if (this.isDragging) {
      const canvas = this.canvasRef().nativeElement;
      const rect = canvas.getBoundingClientRect();
      const dx = ((event.clientX - this.lastPointerX) / rect.width) * this.config.mapViewBoxWidth;
      const dy = ((event.clientY - this.lastPointerY) / rect.height) * this.config.mapViewBoxHeight;
      this.view = { ...this.view, panX: this.view.panX + dx, panY: this.view.panY + dy };
      this.redrawCurrentState();
    }

    this.lastPointerX = event.clientX;
    this.lastPointerY = event.clientY;
  }

  protected onPointerUp(event: PointerEvent): void {
    if (this.draggingUnit) {
      const point = this.toWorldPoint(event.clientX, event.clientY);
      const regionHit = this.geometry.hitTestRegion(Object.values(this.store.regions()), point);
      const seaZoneHit = regionHit
        ? null
        : this.geometry.hitTestSeaZone(Object.values(this.store.seaZones()), point, this.view.scale);
      const dropTarget = regionHit?.id ?? seaZoneHit?.id ?? null;
      const activePlayerId = this.store.state()?.activePlayerId;
      if (dropTarget && activePlayerId) {
        const loadTransportId = this.draggingUnit.loadTargets.get(dropTarget);
        if (loadTransportId) {
          this.store.loadUnit(activePlayerId, this.draggingUnit.unitInstanceId, loadTransportId);
        } else if (this.draggingUnit.attackTargets.includes(dropTarget)) {
          this.store.attackRegion(activePlayerId, this.draggingUnit.unitInstanceId, dropTarget);
        } else if (this.draggingUnit.moveDestinations.includes(dropTarget)) {
          this.store.moveUnit(activePlayerId, this.draggingUnit.unitInstanceId, dropTarget);
        }
      }
      this.draggingUnit = null;
      this.dragPointerPoint = null;
      this.suppressNextClick = true;
      this.canvasRef().nativeElement.classList.remove('unit-dragging');
      this.releasePointerCaptureSafely(event.pointerId);
      this.redrawCurrentState();
      return;
    }

    this.isPointerDown = false;
    this.suppressNextClick = this.isDragging;
    this.isDragging = false;
    this.canvasRef().nativeElement.classList.remove('is-panning');
    this.releasePointerCaptureSafely(event.pointerId);
  }

  protected onPointerLeave(): void {
    if (this.draggingUnit) {
      this.draggingUnit = null;
      this.dragPointerPoint = null;
      this.canvasRef().nativeElement.classList.remove('unit-dragging');
      this.redrawCurrentState();
    }
    this.store.setHoveredRegion(null);
  }

  /**
   * Picks up one of the active player's own units under the pointer, if
   * any — only during a movement phase (Attack Moves or Tactical Moves),
   * only a unit with moves remaining and not currently embarked. During
   * Attack Moves the unit gets both plain move destinations and attack
   * targets (entering an enemy region is the "combat move"); during
   * Tactical Moves it gets move destinations only (friendly territory).
   * Returns the drag state or null if nothing pickable is there.
   */
  private tryPickUpUnit(point: RegionPoint): UnitDragState | null {
    const state = this.store.state();
    if (!state || !MOVEMENT_PHASES.includes(state.phase)) {
      return null;
    }
    const hit = this.geometry.hitTestUnitIcon(
      point,
      this.store.unitsByRegion(),
      this.store.regions(),
      this.store.seaZones(),
      this.view.scale,
    );
    if (!hit) {
      return null;
    }
    const candidate = hit.units.find(
      (u) =>
        u.ownerId === state.activePlayerId &&
        hit.entry.instanceIds.includes(u.id) &&
        u.transportedBy === null &&
        u.movesRemaining > 0,
    );
    if (!candidate) {
      return null;
    }
    const moveDestinations = this.store.legalMoveDestinations(candidate.id);
    const attackTargets =
      state.phase === 'attackMoves' ? this.store.legalAttackTargets(candidate.id) : [];
    const loadTargets = new Map<string, string>();
    for (const target of this.store.loadableTransportTargets(candidate.id)) {
      loadTargets.set(target.seaZoneId, target.transportId);
    }
    return {
      unitInstanceId: candidate.id,
      unitId: candidate.unitId,
      originId: hit.originId,
      moveDestinations,
      attackTargets,
      loadTargets,
    };
  }

  /** setPointerCapture can throw NotFoundError if the pointer session is already gone; that's never fatal here. */
  private setPointerCaptureSafely(pointerId: number): void {
    try {
      this.canvasRef().nativeElement.setPointerCapture(pointerId);
    } catch {
      // Pointer capture is a best-effort UX nicety (keeps drag events flowing
      // if the cursor leaves the canvas); losing it just means those events
      // might not fire, which onPointerLeave already handles gracefully.
    }
  }

  private releasePointerCaptureSafely(pointerId: number): void {
    try {
      this.canvasRef().nativeElement.releasePointerCapture(pointerId);
    } catch {
      // See setPointerCaptureSafely.
    }
  }

  private loadMapImage(): void {
    const image = new Image();
    image.onload = (): void => {
      this.mapImageLoaded = true;
      this.redrawCurrentState();
    };
    image.onerror = (): void => {
      // eslint-disable-next-line no-console
      console.error(`[WorldMap] Failed to load map image at ${this.config.mapImagePath}`);
    };
    image.src = this.config.mapImagePath;
    this.mapImage = image;
  }

  private redrawCurrentState(): void {
    const context = this.context;
    if (!context) {
      return;
    }
    const regionsById = this.store.regions();
    const seaZonesById = this.store.seaZones();
    this.renderer.draw({
      context,
      view: this.view,
      mapImage: this.mapImage,
      mapImageLoaded: this.mapImageLoaded,
      regions: Object.values(regionsById),
      regionsById,
      flagPaths: this.store.regionFlagPaths(),
      selectedId: this.store.selectedRegionId(),
      neighborIds: this.store.neighborIds(),
      hoveredId: this.store.hoveredRegionId(),
      seaZones: Object.values(seaZonesById),
      seaZonesById,
      unitsByRegion: this.store.unitsByRegion(),
      factions: this.store.factions(),
      draggingUnit: this.draggingUnit,
      dragPointerPoint: this.dragPointerPoint,
      activePlayerId: this.store.activePlayer()?.id ?? null,
      movableUnitIds: this.store.movableUnitIds(),
      contestedRegionIds: this.store.contestedRegionIds(),
      getFlagImage: (path) => this.getFlagImage(path),
      getUnitIcon: (unitId, color) => this.unitIconImages.getTintedIcon(unitId, color),
    });
  }

  private syncCanvasResolution(): void {
    const canvas = this.canvasRef().nativeElement;
    const dpr = window.devicePixelRatio || 1;
    const displayWidth = canvas.clientWidth || this.config.mapViewBoxWidth;
    const displayHeight = canvas.clientHeight || this.config.mapViewBoxHeight;
    canvas.width = Math.round(displayWidth * dpr);
    canvas.height = Math.round(displayHeight * dpr);
    const context = this.context;
    if (context) {
      const scaleX = canvas.width / this.config.mapViewBoxWidth;
      const scaleY = canvas.height / this.config.mapViewBoxHeight;
      context.setTransform(scaleX, 0, 0, scaleY, 0, 0);
    }
    this.redrawCurrentState();
  }

  private toWorldPoint(clientX: number, clientY: number): RegionPoint {
    return this.geometry.toWorldPoint(this.canvasRef().nativeElement, clientX, clientY, this.view);
  }

  /** Returns a cached, already-loading-or-loaded Image for a flag asset path. */
  private getFlagImage(path: string): HTMLImageElement {
    const cached = this.flagImages.get(path);
    if (cached) {
      return cached;
    }
    const image = new Image();
    image.onload = (): void => this.redrawCurrentState();
    image.src = path;
    this.flagImages.set(path, image);
    return image;
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
