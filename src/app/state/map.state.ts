import { Injectable, computed, inject, signal } from '@angular/core';
import { GameStateSignal } from './game.state';
import { Region } from '../models/region.model';
import { SeaZone } from '../models/sea-zone.model';
import { UnitDragState } from '../interfaces/map-types';

/**
 * An armed "click a highlighted region on the map" action (PROJECT_RULES.md
 * section 18/30) — the click-to-place counterpart to a canvas drag, used for
 * deploying a Reserve unit or unloading embarked cargo, since neither has an
 * existing map icon to pick up and drag. `subjectId` is the Reserve unit's
 * catalog id for a deploy, or the embarked UnitInstance id for an unload.
 */
export interface PendingMapAction {
  readonly kind: 'deploy' | 'unload';
  readonly subjectId: string;
  readonly destinations: readonly string[];
}

/**
 * Pure UI state for the map (CODING_STANDARDS.md section 10: "Use Signals
 * for UI state only"). Selection is driven by engine events (via GameStore)
 * rather than mutated ad hoc by components, but the signals themselves hold
 * no gameplay logic — only "what is currently highlighted on screen".
 */
@Injectable({ providedIn: 'root' })
export class MapUiState {
  private readonly gameState = inject(GameStateSignal);

  private readonly _selectedRegionId = signal<string | null>(null);
  private readonly _hoveredRegionId = signal<string | null>(null);
  /**
   * A unit drag that started outside the map canvas (e.g. a unit card in
   * RegionInfoPanelComponent) but must be resolved against the map's own
   * region geometry — see WorldMapComponent, which owns the window-level
   * pointermove/pointerup listeners while this is non-null so it can render
   * the same highlight/ghost the canvas-originated drag gets and hit-test
   * the eventual drop point.
   */
  private readonly _externalDrag = signal<UnitDragState | null>(null);
  private readonly _pendingAction = signal<PendingMapAction | null>(null);

  readonly selectedRegionId = this._selectedRegionId.asReadonly();
  readonly hoveredRegionId = this._hoveredRegionId.asReadonly();
  readonly externalDrag = this._externalDrag.asReadonly();
  readonly pendingAction = this._pendingAction.asReadonly();

  readonly selectedRegion = computed<Region | null>(() => {
    const id = this._selectedRegionId();
    if (!id) {
      return null;
    }
    return this.gameState.regions()[id] ?? null;
  });

  readonly selectedSeaZone = computed<SeaZone | null>(() => {
    const id = this._selectedRegionId();
    if (!id) {
      return null;
    }
    return this.gameState.seaZones()[id] ?? null;
  });

  readonly neighborIds = computed<readonly string[]>(
    () => this.selectedRegion()?.neighbors ?? [],
  );

  setSelected(regionId: string | null): void {
    this._selectedRegionId.set(regionId);
  }

  setHovered(regionId: string | null): void {
    this._hoveredRegionId.set(regionId);
  }

  startExternalDrag(drag: UnitDragState): void {
    this._externalDrag.set(drag);
  }

  endExternalDrag(): void {
    this._externalDrag.set(null);
  }

  armPendingAction(action: PendingMapAction): void {
    this._pendingAction.set(action);
  }

  clearPendingAction(): void {
    this._pendingAction.set(null);
  }
}
