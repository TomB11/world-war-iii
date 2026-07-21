import { Injectable, computed, signal } from '@angular/core';
import { GameState } from '../models/game-state.model';
import { Region } from '../models/region.model';
import { SeaZone } from '../models/sea-zone.model';

/**
 * Holds the authoritative GameState as a Signal. Only GameStore is allowed
 * to call `set()`/`update()` here — it does so with the state produced by
 * the Game Engine, never with UI-derived data directly
 * (CODING_STANDARDS.md sections 4 and 10).
 */
@Injectable({ providedIn: 'root' })
export class GameStateSignal {
  private readonly _state = signal<GameState | null>(null);
  private readonly _loadError = signal<string | null>(null);

  readonly state = this._state.asReadonly();
  readonly loadError = this._loadError.asReadonly();

  readonly regions = computed<Readonly<Record<string, Region>>>(
    () => this._state()?.regions ?? {},
  );

  readonly seaZones = computed<Readonly<Record<string, SeaZone>>>(
    () => this._state()?.seaZones ?? {},
  );

  readonly isLoaded = computed(() => this._state() !== null);

  set(next: GameState): void {
    this._state.set(next);
  }

  setLoadError(message: string): void {
    this._loadError.set(message);
  }
}
