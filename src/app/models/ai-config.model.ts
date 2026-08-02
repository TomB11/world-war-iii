/**
 * Solo Command Mode configuration (board-game "World War III 2100" solo
 * rules): one alliance (Faction.teamId) is played by the human, the other
 * entirely by an AI driver (see services/ai-turn.service.ts). Lives inside
 * GameState itself, not an Angular-side wrapper, because every AI decision
 * is dice-driven off GameState.randomSeed — the sole source of replay
 * determinism (PROJECT_RULES.md section 29). `null` on GameState.aiConfig
 * means today's full hotseat behavior, unchanged.
 */
export type AiDoctrine = 'aggressor' | 'fortress' | 'cyberState';
export type AiDifficulty = 'easy' | 'normal' | 'hard' | 'nightmare';

export interface AiConfig {
  readonly doctrine: AiDoctrine;
  readonly difficulty: AiDifficulty;
  /** Faction.teamId of the AI-controlled alliance — the other team is human. */
  readonly aiTeamId: string;
  /** Threat Track counter, 0..10, increases by 1 at the start of each AI turn. */
  readonly threatLevel: number;
  /** Permanent standing effect once threatLevel reaches its max (Threat 10 — "Total War"). */
  readonly totalWarActive: boolean;
}
