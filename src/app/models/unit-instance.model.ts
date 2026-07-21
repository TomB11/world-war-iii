/**
 * A UnitInstance is one physical unit deployed on the map, referencing a
 * UnitDefinition catalog entry (data/units.json) by id. Distinct from a
 * player's Reserve, which only tracks undeployed quantities.
 */
export interface UnitInstance {
  readonly id: string;
  readonly unitId: string;
  readonly ownerId: string;
  readonly regionId: string;
  /** Reset to the unit's catalog movement value at the start of the owner's Movement Phase. */
  readonly movesRemaining: number;
  /** Id of the transport UnitInstance carrying this unit, or null if not embarked (PROJECT_RULES.md section 19). */
  readonly transportedBy: string | null;
  /**
   * True once this unit has attacked this turn (PROJECT_RULES.md section 17):
   * units that fought are excluded from Tactical Moves. Reset to false at
   * the start of the owner's Attack Moves phase, alongside movesRemaining.
   */
  readonly hasFoughtThisTurn: boolean;
}
