/**
 * A Faction is a playable nation/alliance archetype, loaded from data/factions.json.
 */
export interface Faction {
  readonly id: string;
  readonly name: string;
  readonly color: string;
  readonly capitalRegionId: string;
  /** Alliance this faction belongs to for the team victory condition (PROJECT_RULES.md section 2). */
  readonly teamId: string;
}
