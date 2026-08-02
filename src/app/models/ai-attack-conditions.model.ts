/**
 * Solo Command Mode's "AI Attack Conditions" (rulebook section 3): the AI
 * only commits to attacking a DEFENDED region if at least one of these
 * numeric thresholds is met — an undefended region is always attacked
 * regardless (a free capture, no dice risk).
 */
export interface AiAttackConditionsData {
  /** "Has 2+ more units than defender" — the exact delta, tunable here. */
  readonly numericalAdvantageDelta: number;
  /** "Target region value is 5 or 6" — the exact thresholds, tunable here. */
  readonly highValueThresholds: readonly number[];
}
