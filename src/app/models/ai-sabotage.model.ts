/**
 * Solo Command Mode's "Sabotage" (rulebook section 6, one of three possible
 * results): a 1d6 picks which of the three named effects fires against the
 * richest enemy region's owner.
 */
export type AiSabotageEffect = 'moneyLoss' | 'spawnBlock' | 'satisfactionDrop';

export interface AiSabotageEffectsData {
  /** Keyed "1".."6" -> the effect for that roll. */
  readonly effects: Readonly<Record<string, AiSabotageEffect>>;
  readonly moneyLossAmount: number;
  readonly satisfactionDropAmount: number;
}
