/**
 * A UnitDefinition is a catalog entry loaded from data/units.json.
 * Attack/defense/movement are unused until Phase 5 (Movement) and Phase 6
 * (Combat) but are part of the schema now so units.json never needs a
 * breaking shape change later (PROJECT_RULES.md section 28).
 */
export type UnitCategory = 'land' | 'air' | 'naval' | 'support' | 'transport' | 'missile';

export interface UnitDefinition {
  readonly id: string;
  readonly name: string;
  readonly category: UnitCategory;
  readonly cost: number;
  readonly attack: number;
  readonly defense: number;
  readonly movement: number;
  /** Total carrying slots (land + air), used only for the "is this a transport" check. Per-category limits are below. */
  readonly transportCapacity: number;
  /** Land/support units this transport can carry (PROJECT_RULES.md sections 28-30). Defaults to 0. */
  readonly transportLandCapacity?: number;
  /** Air units this transport can carry / land (PROJECT_RULES.md sections 24/29). Defaults to 0. */
  readonly transportAirCapacity?: number;
  /** Whether this transport's air slots accept Fighters, not just Helicopters (only the Aircraft Carrier — sections 26/29). Defaults to false. */
  readonly transportAcceptsFighters?: boolean;
  /** Whether this unit may only be carried by a Fighter-capable transport, i.e. an Aircraft Carrier (Fighter — section 26). Defaults to false. */
  readonly requiresCarrier?: boolean;
  /** Whether a successful undefended capture by this unit can continue into a second adjacent undefended region (PROJECT_RULES.md section 21 — Tank). Defaults to false when absent. */
  readonly captureThrough?: boolean;
  /** Whether this unit can capture a region on its own at all (PROJECT_RULES.md section 22 — Helicopter cannot). Defaults to true when absent. */
  readonly canCapture?: boolean;
  /** Whether moving this unit into a defended enemy region declares a missile strike there instead of a normal attack (PROJECT_RULES.md section 15 — Rocket System). Defaults to false when absent. */
  readonly canDeclareMissile?: boolean;
}

/** One line of a player's Reserve: how many of a given unit type are awaiting deployment. */
export interface ReserveEntry {
  readonly unitId: string;
  readonly quantity: number;
}
