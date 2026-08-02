/**
 * Solo Command Mode's "Difficulty Settings" (rulebook section 8), one preset
 * per AiDifficulty (models/ai-config.model.ts). startingTreasuryDelta is
 * applied once, right after the game loads; treasuryPerTurn is granted at
 * the start of every one of that AI faction's own turns;
 * freeCyberAttackEveryNTurns (Nightmare only) triggers a bonus hack every N
 * completed AI turns for that faction (PlayerState.aiTurnCounter) — 0 means
 * never.
 */
export interface AiDifficultyPreset {
  readonly startingTreasuryDelta: number;
  readonly treasuryPerTurn: number;
  readonly freeCyberAttackEveryNTurns: number;
}

export interface AiDifficultyData {
  readonly presets: Readonly<Record<string, AiDifficultyPreset>>;
}
