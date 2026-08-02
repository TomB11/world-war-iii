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
import { ActiveMapEffect, createMapEffect, mapEffectDurationMs } from '../rendering/effects-renderer';
import { ActiveProjectile, PROJECTILE_DURATION_MS } from '../rendering/projectile-renderer';
import { ActiveUnitMove, UNIT_MOVE_DURATION_MS } from '../rendering/unit-move-renderer';
import { ActiveFlagTransition, FLAG_TRANSITION_DURATION_MS } from '../rendering/flag-transition';
import { MapPoint, UnitDragState, ViewTransform } from '../../../interfaces/map-types';
import { clamp } from '../../../core/utils/math.util';
import { CLICK_DRAG_THRESHOLD_PX } from './world-map.constants';

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
  /** Ghost position (map-unit space) for a drag that started outside the canvas, or null while the pointer is off-canvas. */
  private externalDragPointerPoint: MapPoint | null = null;
  private windowPointerMoveHandler: ((event: PointerEvent) => void) | null = null;
  private windowPointerUpHandler: ((event: PointerEvent) => void) | null = null;

  /** Currently-animating attack/casualty/cyber/deploy bursts (see ui/map/rendering/effects-renderer.ts); pruned as each one's duration elapses. */
  private activeEffects: ActiveMapEffect[] = [];
  /** Highest GameStore.mapEffectEvents() id already turned into a local effect — everything at or below this id has already been spawned. */
  private lastConsumedMapEffectId = 0;
  /** Units currently sliding between regions (see ui/map/rendering/unit-move-renderer.ts). */
  private activeUnitMoves: ActiveUnitMove[] = [];
  private lastConsumedUnitMoveId = 0;
  /** Missiles currently in flight (see ui/map/rendering/projectile-renderer.ts). */
  private activeProjectiles: ActiveProjectile[] = [];
  private lastConsumedMissileFiredId = 0;
  /** Regions currently crossfading their flag (see ui/map/rendering/flag-transition.ts) — keyed by regionId since only the latest transition for a given region ever matters. */
  private activeFlagTransitions: Record<string, ActiveFlagTransition> = {};
  private lastConsumedFlagTransitionId = 0;
  /** Non-null while any animation above is running, or a contested region needs its marching-ants border kept moving: nothing else changes state frame-to-frame during those windows, so this drives its own continuous repaint loop. */
  private animationRafHandle: number | null = null;

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
      this.store.missileStrikePreviews();
      this.store.externalDrag();
      this.store.pendingAction();
      this.redrawCurrentState();
      // A contested region's border animates continuously (marching ants) —
      // keep the loop alive for as long as any exist, independent of the
      // one-shot effect/move/projectile/flag queues below.
      if (this.store.contestedRegionIds().size > 0) {
        this.ensureAnimationLoopRunning();
      }
    });

    // New attack/casualty/cyber/deploy moments queued by GameStore — spawn a
    // local, continuously-animating burst for each one this component hasn't
    // already consumed (ids only ever grow), and make sure the repaint loop
    // is running for as long as any of them is still live.
    effect(() => {
      const events = this.store.mapEffectEvents();
      let spawnedAny = false;
      for (const mapEvent of events) {
        if (mapEvent.id <= this.lastConsumedMapEffectId) {
          continue;
        }
        this.activeEffects.push(createMapEffect(mapEvent.id, mapEvent.regionId, mapEvent.kind, performance.now()));
        this.lastConsumedMapEffectId = mapEvent.id;
        spawnedAny = true;
      }
      if (spawnedAny) {
        this.ensureAnimationLoopRunning();
      }
    });

    // New unit moves queued by GameStore — slide each one from its previous
    // location to its new one instead of popping instantly.
    effect(() => {
      const events = this.store.unitMoveEvents();
      let spawnedAny = false;
      for (const moveEvent of events) {
        if (moveEvent.id <= this.lastConsumedUnitMoveId) {
          continue;
        }
        this.activeUnitMoves.push({
          id: moveEvent.id,
          unitInstanceId: moveEvent.unitInstanceId,
          fromRegionId: moveEvent.fromRegionId,
          toRegionId: moveEvent.toRegionId,
          startedAt: performance.now(),
        });
        this.lastConsumedUnitMoveId = moveEvent.id;
        spawnedAny = true;
      }
      if (spawnedAny) {
        this.ensureAnimationLoopRunning();
      }
    });

    // New missile fires queued by GameStore — animate a projectile from the
    // launcher to the battle region, timed to land with the matching
    // explosion effect RollCombatCommand/FireMissileCommand's events already
    // queued separately above.
    effect(() => {
      const events = this.store.missileFiredEvents();
      let spawnedAny = false;
      for (const missileEvent of events) {
        if (missileEvent.id <= this.lastConsumedMissileFiredId) {
          continue;
        }
        this.activeProjectiles.push({
          id: missileEvent.id,
          launcherRegionId: missileEvent.launcherRegionId,
          targetRegionId: missileEvent.regionId,
          startedAt: performance.now(),
        });
        this.lastConsumedMissileFiredId = missileEvent.id;
        spawnedAny = true;
      }
      if (spawnedAny) {
        this.ensureAnimationLoopRunning();
      }
    });

    // New region captures queued by GameStore — crossfade that region's flag
    // instead of swapping it instantly.
    effect(() => {
      const events = this.store.flagTransitionEvents();
      let spawnedAny = false;
      for (const flagEvent of events) {
        if (flagEvent.id <= this.lastConsumedFlagTransitionId) {
          continue;
        }
        this.activeFlagTransitions = {
          ...this.activeFlagTransitions,
          [flagEvent.regionId]: {
            id: flagEvent.id,
            regionId: flagEvent.regionId,
            previousOwnerId: flagEvent.previousOwnerId,
            startedAt: performance.now(),
          },
        };
        this.lastConsumedFlagTransitionId = flagEvent.id;
        spawnedAny = true;
      }
      if (spawnedAny) {
        this.ensureAnimationLoopRunning();
      }
    });

    // A drag that started in another component (e.g. a unit card in
    // RegionInfoPanelComponent) has no canvas pointer capture to keep
    // delivering move/up events, so this component takes over tracking at
    // the window level for as long as GameStore reports one in progress.
    effect(() => {
      if (this.store.externalDrag()) {
        this.attachExternalDragListeners();
      } else {
        this.detachExternalDragListeners();
      }
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
    this.detachExternalDragListeners();
    if (this.animationRafHandle !== null) {
      cancelAnimationFrame(this.animationRafHandle);
    }
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

    // An armed deploy/unload (GameStore.armDeployUnit/armUnloadUnit) takes
    // over the very next canvas click, wherever it lands — a hit on one of
    // its highlighted destinations commits the action, anything else just
    // cancels it quietly (see resolvePendingActionAt).
    if (this.store.pendingAction()) {
      this.store.resolvePendingActionAt(this.hitTestAt(event.clientX, event.clientY));
      return;
    }

    const point = this.toWorldPoint(event.clientX, event.clientY);
    const region = this.geometry.hitTestRegion(Object.values(this.store.regions()), point);

    // During the Attack Phase, only regions/sea zones with a pending battle
    // respond to clicks — clicking one opens the combat board; everything
    // else on the map (other regions, sea zones, empty space) is a no-op,
    // since there's nothing to select or move (PROJECT_RULES.md sections 9-14).
    if (this.store.state()?.phase === 'attack') {
      if (region && this.store.contestedRegionIds().has(region.id)) {
        this.store.openCombat(region.id);
        return;
      }
      const contestedSeaZone = this.geometry.hitTestSeaZone(
        Object.values(this.store.seaZones()),
        point,
        this.view.scale,
      );
      if (contestedSeaZone && this.store.contestedRegionIds().has(contestedSeaZone.id)) {
        this.store.openCombat(contestedSeaZone.id);
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
        } else {
          this.store.reportInvalidDestination();
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

  /** Whether a client-space point currently falls within the canvas's on-screen bounds. */
  private isPointWithinCanvas(clientX: number, clientY: number): boolean {
    const rect = this.canvasRef().nativeElement.getBoundingClientRect();
    return clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
  }

  /** Resolves a client-space point to whichever region or sea zone (if any) is under it. */
  private hitTestAt(clientX: number, clientY: number): string | null {
    const point = this.toWorldPoint(clientX, clientY);
    const region = this.geometry.hitTestRegion(Object.values(this.store.regions()), point);
    if (region) {
      return region.id;
    }
    const seaZone = this.geometry.hitTestSeaZone(Object.values(this.store.seaZones()), point, this.view.scale);
    return seaZone?.id ?? null;
  }

  private attachExternalDragListeners(): void {
    if (this.windowPointerMoveHandler) {
      return;
    }
    this.windowPointerMoveHandler = (event: PointerEvent): void => {
      if (this.isPointWithinCanvas(event.clientX, event.clientY)) {
        const point = this.toWorldPoint(event.clientX, event.clientY);
        this.externalDragPointerPoint = {
          x: point.x * this.config.mapViewBoxWidth,
          y: point.y * this.config.mapViewBoxHeight,
        };
        this.store.setHoveredRegion(this.hitTestAt(event.clientX, event.clientY));
      } else {
        this.externalDragPointerPoint = null;
        this.store.setHoveredRegion(null);
      }
      this.redrawCurrentState();
    };
    this.windowPointerUpHandler = (event: PointerEvent): void => {
      const dropTarget = this.isPointWithinCanvas(event.clientX, event.clientY)
        ? this.hitTestAt(event.clientX, event.clientY)
        : null;
      this.store.resolveExternalDrop(dropTarget);
      this.store.setHoveredRegion(null);
    };
    window.addEventListener('pointermove', this.windowPointerMoveHandler);
    window.addEventListener('pointerup', this.windowPointerUpHandler);
  }

  private detachExternalDragListeners(): void {
    if (this.windowPointerMoveHandler) {
      window.removeEventListener('pointermove', this.windowPointerMoveHandler);
      this.windowPointerMoveHandler = null;
    }
    if (this.windowPointerUpHandler) {
      window.removeEventListener('pointerup', this.windowPointerUpHandler);
      this.windowPointerUpHandler = null;
    }
    this.externalDragPointerPoint = null;
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

  /**
   * Keeps repainting every frame while any of the animations above is still
   * live, or a contested region's border still needs to "march" — nothing
   * else drives a redraw during that window, since the underlying game
   * state isn't changing frame-to-frame. Stops itself once every animation
   * queue is empty AND no contested region remains (checked each tick, since
   * a battle can resolve or a new one can open while this loop is running).
   */
  private ensureAnimationLoopRunning(): void {
    if (this.animationRafHandle !== null) {
      return;
    }
    const tick = (): void => {
      const now = performance.now();
      this.activeEffects = this.activeEffects.filter((effect) => now - effect.startedAt <= mapEffectDurationMs(effect.kind));
      this.activeUnitMoves = this.activeUnitMoves.filter((move) => now - move.startedAt <= UNIT_MOVE_DURATION_MS);
      this.activeProjectiles = this.activeProjectiles.filter((p) => now - p.startedAt <= PROJECTILE_DURATION_MS);
      this.activeFlagTransitions = Object.fromEntries(
        Object.entries(this.activeFlagTransitions).filter(([, t]) => now - t.startedAt <= FLAG_TRANSITION_DURATION_MS),
      );
      this.redrawCurrentState();
      const stillAnimating =
        this.activeEffects.length > 0 ||
        this.activeUnitMoves.length > 0 ||
        this.activeProjectiles.length > 0 ||
        Object.keys(this.activeFlagTransitions).length > 0 ||
        this.store.contestedRegionIds().size > 0;
      this.animationRafHandle = stillAnimating ? requestAnimationFrame(tick) : null;
    };
    this.animationRafHandle = requestAnimationFrame(tick);
  }

  private redrawCurrentState(): void {
    const context = this.context;
    if (!context) {
      return;
    }
    const regionsById = this.store.regions();
    const seaZonesById = this.store.seaZones();
    const draggingUnit = this.draggingUnit ?? this.store.externalDrag();
    const dragPointerPoint = this.draggingUnit ? this.dragPointerPoint : this.externalDragPointerPoint;
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
      draggingUnit,
      dragPointerPoint,
      pendingActionTargets: this.store.pendingAction()?.destinations ?? [],
      activePlayerId: this.store.activePlayer()?.id ?? null,
      movableUnitIds: this.store.movableUnitIds(),
      contestedRegionIds: this.store.contestedRegionIds(),
      missileStrikePreviews: this.store.missileStrikePreviews(),
      activeEffects: this.activeEffects,
      activeProjectiles: this.activeProjectiles,
      activeUnitMoves: this.activeUnitMoves,
      activeFlagTransitions: this.activeFlagTransitions,
      now: performance.now(),
      getFlagImage: (path) => this.getFlagImage(path),
      getUnitIcon: (unitId, ownerId, color) => this.unitIconImages.getTintedIcon(unitId, ownerId, color),
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
