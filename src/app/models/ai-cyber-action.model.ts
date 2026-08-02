/**
 * Solo Command Mode's "Cyber & Political Actions" roll (rulebook section 6):
 * rolled during the AI's Cyber Attack Phase whenever it has 3+ money
 * (economyConfig.cyberAttackCost, the same cost any Cyber Attack action
 * charges). 'none' means no action this turn.
 */
export type AiCyberAction = 'none' | 'hack' | 'influence' | 'sabotage';

export interface AiCyberActionTableData {
  /** Keyed "1".."6" -> the action for that roll. */
  readonly table: Readonly<Record<string, AiCyberAction>>;
}
