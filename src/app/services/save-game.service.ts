import { Injectable } from '@angular/core';
import { GameState } from '../models/game-state.model';
import { SAVE_GAME_FILE_NAME_PREFIX, SAVE_GAME_LOCAL_STORAGE_KEY } from './save-game.constants';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * Structural check only (PROJECT_RULES.txt section 40's field list) — not a
 * deep validation of every nested unit/region. A file that passes this but
 * is otherwise corrupted surfaces as a normal engine error during play
 * rather than being silently rejected here.
 */
function isGameState(value: unknown): value is GameState {
  if (!isRecord(value)) {
    return false;
  }
  return (
    isRecord(value['regions']) &&
    isRecord(value['seaZones']) &&
    Array.isArray(value['straits']) &&
    Array.isArray(value['players']) &&
    Array.isArray(value['units']) &&
    typeof value['activePlayerId'] === 'string' &&
    typeof value['phase'] === 'string' &&
    typeof value['turnNumber'] === 'number' &&
    typeof value['randomSeed'] === 'number' &&
    typeof value['nextUnitInstanceId'] === 'number' &&
    isRecord(value['combats']) &&
    isRecord(value['missileDeclarations']) &&
    isRecord(value['unitsDeployedThisTurn']) &&
    Array.isArray(value['sabotagedRegionIds'])
  );
}

/**
 * Persists/restores a whole GameState (PROJECT_RULES.txt section 40: "Entire
 * game state must be saved"). GameState is already plain JSON-serializable
 * data (models/game-state.model.ts), so this is a thin wrapper around
 * localStorage and file download/upload — saving/loading isn't a gameplay
 * action, so it never goes through the Game Engine, matching the precedent
 * of GameCoreStore.initialize() patching `state` directly.
 */
@Injectable({ providedIn: 'root' })
export class SaveGameService {
  /**
   * One-shot hand-off from a menu screen (Continue / Import) to
   * GameScreenComponent.ngOnInit. Not a Signal — nothing binds to it in a
   * template, it just needs to survive one router navigation.
   */
  private pendingLoad: GameState | null = null;

  setPendingLoad(state: GameState): void {
    this.pendingLoad = state;
  }

  consumePendingLoad(): GameState | null {
    const state = this.pendingLoad;
    this.pendingLoad = null;
    return state;
  }

  hasLocalStorageSave(): boolean {
    return localStorage.getItem(SAVE_GAME_LOCAL_STORAGE_KEY) !== null;
  }

  saveToLocalStorage(state: GameState): void {
    localStorage.setItem(SAVE_GAME_LOCAL_STORAGE_KEY, JSON.stringify(state));
  }

  loadFromLocalStorage(): GameState | null {
    const raw = localStorage.getItem(SAVE_GAME_LOCAL_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    try {
      const parsed: unknown = JSON.parse(raw);
      return isGameState(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }

  /** Downloads the save as a JSON file — the "save to a folder" path, for backups or moving a save between machines. */
  exportToFile(state: GameState): void {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${SAVE_GAME_FILE_NAME_PREFIX}${state.turnNumber}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async importFromFile(file: File): Promise<GameState> {
    const text = await file.text();
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error('Selected file is not valid JSON.');
    }
    if (!isGameState(parsed)) {
      throw new Error('Selected file is not a valid World War III save.');
    }
    return parsed;
  }
}
