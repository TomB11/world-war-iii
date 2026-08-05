import { patchState, signalStore, withMethods, withState } from '@ngrx/signals';
import { AiDifficulty, AiDoctrine } from '../../models/ai-config.model';

export interface SoloSelection {
  /** Faction.teamId the human plays (the other team becomes AI-controlled). */
  readonly humanTeamId: string;
  readonly doctrine: AiDoctrine;
  readonly difficulty: AiDifficulty;
}

interface SoloSetupSlice {
  readonly humanTeamId: string | null;
  readonly selection: SoloSelection | null;
}

const initialState: SoloSetupSlice = {
  humanTeamId: null,
  selection: null,
};

/**
 * Bridges the choose-side -> solo-setup screens' picks into
 * GameCoreStore.initialize(), read exactly once at game bootstrap.
 * `selection` stays null for today's full hotseat play (no AI) — set only
 * once the player finishes both screens, never mutated once the game has
 * started. This is the one legitimate exception to "components only ever
 * inject GameStore" (PROJECT_STRUCTURE.md §2): ChooseSideComponent and
 * SoloSetupComponent run before GameCoreStore even exists, so they talk to
 * this small standalone store directly.
 */
export const SoloSetupStore = signalStore(
  { providedIn: 'root' },
  withState(initialState),
  withMethods((store) => ({
    /** Set by ChooseSideComponent; read by SoloSetupComponent to assemble the full selection. */
    setHumanTeamId(teamId: string): void {
      patchState(store, { humanTeamId: teamId });
    },
    setSelection(selection: SoloSelection | null): void {
      patchState(store, { selection });
    },
  })),
);
