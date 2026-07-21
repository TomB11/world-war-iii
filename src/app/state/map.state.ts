import { Injectable, computed, inject, signal } from '@angular/core';
import { GameStateSignal } from './game.state';
import { Region } from '../models/region.model';
import { SeaZone } from '../models/sea-zone.model';

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

  readonly selectedRegionId = this._selectedRegionId.asReadonly();
  readonly hoveredRegionId = this._hoveredRegionId.asReadonly();

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
}
