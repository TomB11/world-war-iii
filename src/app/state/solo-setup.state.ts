import { Injectable, signal } from '@angular/core';
import { AiDifficulty, AiDoctrine } from '../models/ai-config.model';

export interface SoloSelection {
  /** Faction.teamId the human plays (the other team becomes AI-controlled). */
  readonly humanTeamId: string;
  readonly doctrine: AiDoctrine;
  readonly difficulty: AiDifficulty;
}

/**
 * Bridges the choose-side -> solo-setup screens' picks into
 * GameStore.initialize(), read exactly once at game bootstrap. `selection`
 * stays null for today's full hotseat play (no AI) — set only once the
 * player finishes both screens, never mutated once the game has started.
 */
@Injectable({ providedIn: 'root' })
export class SoloSetupState {
  private readonly _humanTeamId = signal<string | null>(null);
  private readonly _selection = signal<SoloSelection | null>(null);

  readonly selection = this._selection.asReadonly();

  /** Set by ChooseSideComponent; read by SoloSetupComponent to assemble the full selection. */
  setHumanTeamId(teamId: string): void {
    this._humanTeamId.set(teamId);
  }

  humanTeamId(): string | null {
    return this._humanTeamId();
  }

  setSelection(selection: SoloSelection | null): void {
    this._selection.set(selection);
  }
}
