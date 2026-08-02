/**
 * Solo Command Mode's "Determine AI Order" roll (rulebook section 2, step
 * 2): a 1d6 rolled once at the start of the AI's Buy Units phase, deciding
 * this turn's primary intent — read back during Attack Moves (and, in a
 * later build step, Cyber/Political and doctrine-special actions).
 */
export type AiOrderAction =
  | 'attackNearest'
  | 'attackRichestAdjacent'
  | 'attackWeakestAdjacent'
  | 'reinforceThreatened'
  | 'pressureNeutral'
  | 'doctrineSpecial';

export interface AiOrderTableData {
  /** Keyed "1".."6" -> the order action for that roll. */
  readonly table: Readonly<Record<string, AiOrderAction>>;
}
