/**
 * One band of the Citizen Satisfaction track (PROJECT_RULES.md section 5),
 * e.g. the red "rebellion" band or a gold "income bonus" band. `min`/`max`
 * are inclusive.
 */
export interface CitizenSatisfactionZone {
  readonly min: number;
  readonly max: number;
  readonly incomeBonus?: number;
  readonly victoryPoints?: number;
}

/**
 * Static, data-driven economy configuration loaded once at game start
 * (data/economy.json, PROJECT_RULES.md section 41) and reused every turn —
 * unlike startingTreasury/startingHackLevel/startingCitizenSatisfaction,
 * which are init-only, this shape stays relevant for the life of the game.
 */
export interface RebelArmyEntry {
  readonly unitId: string;
  readonly quantity: number;
}

export interface EconomyConfig {
  readonly citizenSatisfactionMin: number;
  readonly citizenSatisfactionMax: number;
  readonly citizenSatisfactionDecayPerTurn: number;
  readonly citizenSatisfactionZones: Readonly<Record<string, CitizenSatisfactionZone>>;
  /** Spawned at a faction's capital when their rebellionLevel reaches 3 (PROJECT_RULES.md section 5). */
  readonly rebelArmy: readonly RebelArmyEntry[];
  /** Standing garrison spawned in every neutral (unowned) region at game start (PROJECT_RULES.md section 2). */
  readonly neutralArmy: readonly RebelArmyEntry[];
  /** Citizen Satisfaction drop for the attacker on a successful forced capture (PROJECT_RULES.md section 5). */
  readonly captureSatisfactionPenaltyAttacker: number;
  /** Citizen Satisfaction drop for the previous owner when a region is taken from them by force. */
  readonly captureSatisfactionPenaltyDefender: number;
  /** Flat treasury cost to attempt either Cyber Attack action — Hacking or Political Influence (PROJECT_RULES.md section 6). */
  readonly cyberAttackCost: number;
  /** Political Influence succeeds when a d6 roll is <= this (PROJECT_RULES.md section 6). */
  readonly politicalInfluenceThreshold: number;
  /** Tokens by which a faction must lead any rival to flip a neutral region via Political Influence. */
  readonly politicalInfluenceMajority: number;
  /** White-star regions one faction alone must hold to win solo (PROJECT_RULES.md section 2). */
  readonly soloVictoryStarCount: number;
  /** White-star regions a team must hold combined to win together (PROJECT_RULES.md section 2). */
  readonly teamVictoryStarCount: number;
  /** Treasury cost to raise a player's own Hack Level by 1 (PROJECT_RULES.md section 6). Shares the once-per-turn Cyber Attack slot. */
  readonly hackLevelUpgradeCost: number;
  /** Hack Level cannot be raised past this (PROJECT_RULES.md section 6). */
  readonly hackLevelMax: number;
  /** Treasury cost to convert one Infantry unit into an Airborne variant (PROJECT_RULES.md section 20). */
  readonly infantryAirborneUpgradeCost: number;
}
