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
}
