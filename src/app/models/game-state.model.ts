import { AiConfig } from './ai-config.model';
import { PlayerState } from './player.model';
import { Region } from './region.model';
import { RegionCombat } from './region-combat.model';
import { SeaZone } from './sea-zone.model';
import { Strait } from './strait.model';
import { UnitInstance } from './unit-instance.model';

/**
 * Turn order exactly as defined in PROJECT_RULES.md section 3. Collect
 * Income is LAST — it funds next turn's Buy Units, not this one. There is
 * no separate 'endTurn' phase; ending the turn is what happens when you
 * advance past 'collectIncome' (the last phase), via EndTurnCommand.
 */
export type GamePhase =
  | 'buyUnits'
  | 'cyberAttack'
  | 'attackMoves'
  | 'attack'
  | 'tacticalMoves'
  | 'placeNewUnits'
  | 'collectIncome';

export interface GameState {
  readonly regions: Readonly<Record<string, Region>>;
  readonly seaZones: Readonly<Record<string, SeaZone>>;
  readonly straits: readonly Strait[];
  readonly players: readonly PlayerState[];
  readonly units: readonly UnitInstance[];
  readonly activePlayerId: string;
  readonly phase: GamePhase;
  readonly turnNumber: number;
  readonly randomSeed: number;
  /**
   * Monotonically increasing counter used to mint new `UnitInstance` ids.
   * Never derived from `units.length` — casualties shrink that array, so a
   * length-based id can collide with a still-alive unit's id.
   */
  readonly nextUnitInstanceId: number;
  /** In-progress Attack Phase battles, keyed by regionId (PROJECT_RULES.md sections 9-14). */
  readonly combats: Readonly<Record<string, RegionCombat>>;
  /**
   * Regions with a Rocket System missile strike declared this turn, keyed by
   * target regionId -> the declaring UnitInstance id (PROJECT_RULES.md
   * section 15). The launcher never moves — it stays put and only supports
   * a battle its own side already opened by physically attacking that
   * region. Cleared for the ending player's declarations in EndTurnCommand.
   */
  readonly missileDeclarations: Readonly<Record<string, string>>;
  /**
   * Units deployed so far this Place New Units phase, keyed by the factory
   * regionId that produced them (for naval units this is the adjacent
   * factory region, not the sea zone they landed in) — caps deploys against
   * `Region.factory` (PROJECT_RULES.md section 18). Reset to `{}` whenever
   * the active player enters the Place New Units phase (AdvancePhaseCommand).
   */
  readonly unitsDeployedThisTurn: Readonly<Record<string, number>>;
  /** Solo Command Mode setup, or null for today's full hotseat play (see models/ai-config.model.ts). */
  readonly aiConfig: AiConfig | null;
  /**
   * Regions currently blocked from producing this turn by an AI Sabotage
   * action (Solo Command Mode). Only cleared for the affected owner's own
   * placeNewUnits phase (AdvancePhaseCommand) — must survive until the
   * victim's own turn, not be blanket-cleared like unitsDeployedThisTurn.
   */
  readonly sabotagedRegionIds: readonly string[];
}
