/** What an AttackCommand actually did, so CancelAttackCommand knows how to undo it. */
export type AttackRecordKind =
  /** Moved in alongside hostile defenders — a battle is pending. */
  | 'contest'
  /** Walked into an undefended region and took it (ownership flipped, Citizen Satisfaction penalties applied). */
  | 'capture'
  /** A ship sailed into a sea zone nobody hostile holds any more. */
  | 'unopposed'
  /** A Rocket System declared a supporting missile strike without moving. */
  | 'missile';

/**
 * One Attack Moves Phase attack this turn (GameState.attackRecords). Kept
 * until Tactical Moves begins: the map draws the trajectory from it, and the
 * attacker may cancel it any time before leaving the Attack Moves phase.
 */
export interface AttackRecord {
  readonly kind: AttackRecordKind;
  readonly unitInstanceId: string;
  readonly fromRegionId: string;
  readonly toRegionId: string;
  readonly movesBefore: number;
  readonly hadFoughtBefore: boolean;
  /** 'capture' only: who owned the region before, and its previous capturedOnTurn stamp. */
  readonly previousOwnerId?: string | null;
  readonly previousCapturedOnTurn?: number;
  /** 'capture' only: the Citizen Satisfaction change actually applied to each player (negative numbers), so it can be reversed exactly. */
  readonly satisfactionDelta?: Readonly<Record<string, number>>;
}
