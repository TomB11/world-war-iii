/** A region just changed hands — its hotspot crossfades from the previous owner's flag to the current one instead of swapping instantly. */
export interface ActiveFlagTransition {
  readonly id: number;
  readonly regionId: string;
  readonly previousOwnerId: string | null;
  readonly startedAt: number;
}

export const FLAG_TRANSITION_DURATION_MS = 550;
