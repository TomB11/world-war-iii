/**
 * Solo Command Mode's "Threat Track" (rulebook section 7): a shared counter
 * for the whole AI-controlled alliance (GameState.aiConfig.threatLevel, not
 * per-faction), increased by 1 at the start of every AI faction's turn.
 * Crossing a threshold grants a one-time bonus; reaching maxLevel also sets
 * aiConfig.totalWarActive permanently (the rulebook doesn't say what happens
 * past the top of the track, so this build treats it as a standing effect
 * rather than a repeating one-shot or an ever-climbing counter).
 */
export type ThreatBonusType = 'treasury' | 'freeCyberAttack' | 'freeInfantry' | 'freeMissileStrike' | 'totalWar';

export interface ThreatThreshold {
  readonly level: number;
  readonly bonus: ThreatBonusType;
  /** For bonus: 'treasury' — how much free money is granted. */
  readonly amount?: number;
  /** For bonus: 'freeInfantry' — which unit and how many are added to Reserve. */
  readonly unitId?: string;
  readonly quantity?: number;
}

export interface AiThreatTrackData {
  readonly maxLevel: number;
  readonly thresholds: readonly ThreatThreshold[];
}
