/**
 * A Strait is a chokepoint between two regions separated by water, loaded
 * from data/straits.json. Not a regular Region.neighbors edge: land units
 * may only cross it when both regionA and regionB are owned by the same
 * player (a land bridge), per PROJECT_RULES.md section 6.
 */
export interface Strait {
  readonly id: string;
  readonly regionA: string;
  readonly regionB: string;
}
