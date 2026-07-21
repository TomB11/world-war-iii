import { Faction } from './faction.model';
import { ReserveEntry } from './unit.model';

/**
 * PlayerState represents one player/faction's state in the game.
 */
export interface PlayerState {
  readonly id: string;
  readonly factionId: Faction['id'];
  readonly displayName: string;
  readonly treasury: number;
  readonly isEliminated: boolean;
  /** Units purchased but not yet deployed (PROJECT_RULES.md section 26). */
  readonly reserve: readonly ReserveEntry[];
  /**
   * Hack Level, 1-3 (PROJECT_RULES.md section 6). Display-only for now —
   * the Cyber Attack Phase actions that let a player raise it are future
   * work (IMPLEMENTATION_PLAN.md Phase 9).
   */
  readonly hackLevel: number;
  /**
   * Citizen/happiness marker, 1-80 (PROJECT_RULES.md section 5). Decays by
   * 5 automatically at the start of each of the player's turns; driving it
   * into the red zone (<=20) escalates rebellionLevel, and higher zones
   * grant an income bonus or victory points — see EndTurnCommand.
   */
  readonly citizenSatisfaction: number;
  /**
   * How many consecutive turns citizenSatisfaction has ended in the red
   * zone (<=20), 0-3 (PROJECT_RULES.md section 5). Level 2 halves income;
   * level 3 spawns a rebel army at the faction's capital. Resets to 0 once
   * public spending raises citizenSatisfaction back above 20.
   */
  readonly rebellionLevel: number;
  /**
   * Bonus points earned from sustained high citizen satisfaction
   * (PROJECT_RULES.md section 5) — a separate running total from any
   * future white-star-region victory points (see PROJECT_RULES.md
   * section 2); nothing currently checks either total for a win.
   */
  readonly victoryPoints: number;
  /**
   * Whether this player has already attempted a Cyber Attack action
   * (Hacking or Political Influence) this turn — only one is allowed per
   * Cyber Attack Phase (PROJECT_RULES.md section 6). Resets to false when
   * their Cyber Attack Phase begins (AdvancePhaseCommand).
   */
  readonly hasUsedCyberAttackThisTurn: boolean;
}
