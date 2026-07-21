import { GameState } from '../models/game-state.model';
import { PlayerState } from '../models/player.model';
import { Region } from '../models/region.model';
import { UnitDefinition } from '../models/unit.model';
import { UnitInstance } from '../models/unit-instance.model';
import { RegionCombat } from '../models/region-combat.model';

/**
 * Read-only gameplay rule queries. The Rules Engine never mutates state;
 * it answers questions the Game Engine and commands rely on (e.g. "is this
 * a legal region?", "who are the neighbors?"). Combat/movement/economy
 * rule sets are added here in their respective phases.
 */
export class RulesEngine {
  isValidRegion(state: GameState, regionId: string): boolean {
    return regionId in state.regions;
  }

  getRegion(state: GameState, regionId: string): Region | null {
    return state.regions[regionId] ?? null;
  }

  getNeighborRegions(state: GameState, regionId: string): readonly Region[] {
    const region = state.regions[regionId];
    if (!region) {
      return [];
    }
    return region.neighbors
      .map((neighborId) => state.regions[neighborId])
      .filter((neighbor): neighbor is Region => neighbor !== undefined);
  }

  getPlayer(state: GameState, playerId: string): PlayerState | null {
    return state.players.find((player) => player.id === playerId) ?? null;
  }

  /** Sum of region.value across every region currently owned by the given player (PROJECT_RULES.md section 4). */
  calculateIncome(state: GameState, playerId: string): number {
    let total = 0;
    for (const region of Object.values(state.regions)) {
      if (region.ownerId === playerId) {
        total += region.value;
      }
    }
    return total;
  }

  getUnitInstance(state: GameState, unitInstanceId: string): UnitInstance | null {
    return state.units.find((unit) => unit.id === unitInstanceId) ?? null;
  }

  getUnitsInRegion(state: GameState, regionId: string): readonly UnitInstance[] {
    return state.units.filter((unit) => unit.regionId === regionId);
  }

  /**
   * Transports this unit could board right now (PROJECT_RULES.md section 30):
   * friendly transports sitting in a sea zone that borders the unit's region
   * (or its exact location) and still have a free slot of the right type
   * (air units need air slots, land/support units need land slots). Returns
   * the sea zone + transport id for each, so the UI can offer/drag-to-load.
   */
  getLoadableTransportTargets(
    state: GameState,
    unit: UnitInstance,
    unitCatalog: Readonly<Record<string, UnitDefinition>>,
  ): readonly { seaZoneId: string; transportId: string }[] {
    if (unit.transportedBy !== null) {
      return [];
    }
    const unitDef = unitCatalog[unit.unitId];
    if (!unitDef || unitDef.transportCapacity > 0) {
      return []; // transports can't be loaded onto other transports
    }
    const isAir = unitDef.category === 'air';
    const isLand = unitDef.category === 'land' || unitDef.category === 'support';
    if (!isAir && !isLand) {
      return [];
    }

    const targets: { seaZoneId: string; transportId: string }[] = [];
    for (const seaZone of Object.values(state.seaZones)) {
      if (seaZone.id !== unit.regionId && !seaZone.adjacentRegionIds.includes(unit.regionId)) {
        continue;
      }
      const transport = state.units.find((candidate) => {
        const candidateDef = unitCatalog[candidate.unitId];
        if (
          candidate.regionId !== seaZone.id ||
          candidate.ownerId !== unit.ownerId ||
          (candidateDef?.transportCapacity ?? 0) <= 0 ||
          !this.transportHasFreeSlot(state, candidate, isAir, unitCatalog)
        ) {
          return false;
        }
        // Fighters need a carrier; helicopters/land units don't.
        if (isAir && unitDef.requiresCarrier && !candidateDef?.transportAcceptsFighters) {
          return false;
        }
        return true;
      });
      if (transport) {
        targets.push({ seaZoneId: seaZone.id, transportId: transport.id });
      }
    }
    return targets;
  }

  /**
   * Coastal regions an embarked unit could disembark onto (PROJECT_RULES.md
   * section 30): land regions bordering the transport's sea zone. This is
   * phase-dependent:
   * - Attack Moves: HOSTILE coasts only — an amphibious assault (the
   *   disembark IS the attack, section 7).
   * - Tactical Moves (or anything else): friendly-owned or empty coasts only
   *   — a peaceful landing.
   */
  getUnloadDestinations(state: GameState, embarkedUnit: UnitInstance): readonly string[] {
    if (embarkedUnit.transportedBy === null) {
      return [];
    }
    const seaZone = state.seaZones[embarkedUnit.regionId];
    if (!seaZone) {
      return [];
    }
    const amphibiousAssault = state.phase === 'attackMoves';
    return seaZone.adjacentRegionIds.filter((regionId) => {
      const region = state.regions[regionId];
      if (!region) {
        return false;
      }
      if (amphibiousAssault) {
        return this.isHostileRegion(state, regionId, embarkedUnit.ownerId);
      }
      if (region.ownerId === embarkedUnit.ownerId) {
        return true;
      }
      return region.ownerId === null && !this.isDefendedByHostiles(state, regionId, embarkedUnit.ownerId);
    });
  }

  private transportHasFreeSlot(
    state: GameState,
    transport: UnitInstance,
    isAirPassenger: boolean,
    unitCatalog: Readonly<Record<string, UnitDefinition>>,
  ): boolean {
    const transportDef = unitCatalog[transport.unitId];
    if (!transportDef) {
      return false;
    }
    const capacity = isAirPassenger
      ? transportDef.transportAirCapacity ?? 0
      : transportDef.transportLandCapacity ?? 0;
    if (capacity <= 0) {
      return false;
    }
    const occupied = state.units.filter((u) => {
      if (u.transportedBy !== transport.id) {
        return false;
      }
      const embarkedIsAir = unitCatalog[u.unitId]?.category === 'air';
      return isAirPassenger ? embarkedIsAir : !embarkedIsAir;
    }).length;
    return occupied < capacity;
  }

  /** Count of white-star regions (PROJECT_RULES.md section 2) currently owned by the given player. */
  getVictoryStarCount(state: GameState, playerId: string): number {
    let total = 0;
    for (const region of Object.values(state.regions)) {
      if (region.isVictoryStar && region.ownerId === playerId) {
        total += 1;
      }
    }
    return total;
  }

  /** Regions where playerId's units co-locate with at least one hostile owner's units — an unresolved Attack Phase battle (PROJECT_RULES.md sections 7/8/31). */
  getContestedRegionIds(state: GameState, playerId: string): readonly string[] {
    const ownersByRegion = new Map<string, Set<string>>();
    for (const unit of state.units) {
      let owners = ownersByRegion.get(unit.regionId);
      if (!owners) {
        owners = new Set();
        ownersByRegion.set(unit.regionId, owners);
      }
      owners.add(unit.ownerId);
    }
    const contested: string[] = [];
    for (const [regionId, owners] of ownersByRegion) {
      if (owners.has(playerId) && owners.size > 1) {
        contested.push(regionId);
      }
    }
    return contested;
  }

  /**
   * Whether a fresh battle in this region should open with the missile
   * sub-phase (PROJECT_RULES.md section 15): the attacker has a
   * missile-declaring unit (Rocket System) physically present here, and
   * their Reserve actually holds at least one missile to fire. False (skip
   * straight to normal combat) if either condition doesn't hold.
   */
  hasPendingMissileStrike(
    state: GameState,
    regionId: string,
    playerId: string,
    unitCatalog: Readonly<Record<string, UnitDefinition>>,
  ): boolean {
    const hasLauncher = state.units.some(
      (unit) => unit.regionId === regionId && unit.ownerId === playerId && unitCatalog[unit.unitId]?.canDeclareMissile,
    );
    if (!hasLauncher) {
      return false;
    }
    const player = this.getPlayer(state, playerId);
    if (!player) {
      return false;
    }
    return player.reserve.some(
      (entry) => entry.quantity > 0 && unitCatalog[entry.unitId]?.category === 'missile',
    );
  }

  /** A fresh RegionCombat for a newly-opened battle, starting with the missile sub-phase when one is pending (see hasPendingMissileStrike), otherwise straight into normal combat. */
  createInitialCombat(
    state: GameState,
    regionId: string,
    playerId: string,
    unitCatalog: Readonly<Record<string, UnitDefinition>>,
  ): RegionCombat {
    return {
      regionId,
      round: 1,
      step: this.hasPendingMissileStrike(state, regionId, playerId, unitCatalog) ? 'missileChoice' : 'attackerRoll',
      pendingDefenderCasualties: 0,
      pendingAttackerCasualties: 0,
      lastAttackerRolls: [],
      lastDefenderRolls: [],
      attackerCasualties: [],
      defenderCasualties: [],
      missileResult: null,
    };
  }

  /**
   * Standable regions this unit can reach this turn, region id -> the number
   * of movement points it costs to get there (its distance in hops from the
   * unit's current location, BFS up to movesRemaining). "Standable" = a
   * region the unit could legally END on: friendly-owned, truly empty, or
   * any sea zone for naval. Air units path over anything (they only ignore
   * terrain, not distance — a Fighter with movement 4 reaches up to 4
   * regions away); land units path only through friendly/empty territory.
   */
  getReachableMoves(
    state: GameState,
    unit: UnitInstance,
    unitCatalog: Readonly<Record<string, UnitDefinition>>,
  ): ReadonlyMap<string, number> {
    return this.computeReach(state, unit, unitCatalog).moves;
  }

  /**
   * Regions holding hostile units (enemy-owned, or a neutral garrison —
   * PROJECT_RULES.md section 2) this unit can reach and attack this turn,
   * region id -> movement-point cost to enter. Land units must path through
   * friendly/empty territory and enter the hostile region on the final hop;
   * air units fly over anything within their movement range. Naval combat
   * isn't modeled yet (Phase 8), so naval units have no attack targets.
   */
  getReachableAttacks(
    state: GameState,
    unit: UnitInstance,
    unitCatalog: Readonly<Record<string, UnitDefinition>>,
  ): ReadonlyMap<string, number> {
    return this.computeReach(state, unit, unitCatalog).attacks;
  }

  /**
   * Tactical Moves destinations (PROJECT_RULES.md section 17): reachable
   * regions the mover ALREADY owns — no neutral/empty expansion here, that
   * belongs to Attack Moves. Naval units keep full sea-zone mobility.
   */
  getTacticalMoveDestinations(
    state: GameState,
    unit: UnitInstance,
    unitCatalog: Readonly<Record<string, UnitDefinition>>,
  ): readonly string[] {
    const category = unitCatalog[unit.unitId]?.category;
    const reachable = this.computeReach(state, unit, unitCatalog).moves;
    if (category === 'naval') {
      return [...reachable.keys()];
    }
    return [...reachable.keys()].filter((regionId) => state.regions[regionId]?.ownerId === unit.ownerId);
  }

  /** Attack Moves targets (PROJECT_RULES.md sections 7/8): reachable hostile regions. */
  getLegalAttackTargets(
    state: GameState,
    unit: UnitInstance,
    unitCatalog: Readonly<Record<string, UnitDefinition>>,
  ): readonly string[] {
    return [...this.computeReach(state, unit, unitCatalog).attacks.keys()];
  }

  /** Whether any unit not owned by `ownerId` currently sits in `regionId` — enemy defenders, or a neutral garrison. */
  private isDefendedByHostiles(state: GameState, regionId: string, ownerId: string): boolean {
    return state.units.some((candidate) => candidate.regionId === regionId && candidate.ownerId !== ownerId);
  }

  private isHostileRegion(state: GameState, regionId: string, ownerId: string): boolean {
    const region = state.regions[regionId];
    if (!region) {
      return false; // sea zones are never "hostile" — naval combat is deferred
    }
    if (region.ownerId !== null && region.ownerId !== ownerId) {
      return true;
    }
    return this.isDefendedByHostiles(state, regionId, ownerId);
  }

  /** Can a path pass THROUGH this location? Air flies over anything; land needs friendly/empty; naval needs a sea zone. */
  private isTraversable(state: GameState, id: string, ownerId: string, category: string | undefined): boolean {
    if (category === 'naval') {
      return id in state.seaZones;
    }
    if (category === 'air') {
      return id in state.regions;
    }
    const region = state.regions[id];
    if (!region) {
      return false;
    }
    if (region.ownerId === ownerId) {
      return true;
    }
    return region.ownerId === null && !this.isDefendedByHostiles(state, id, ownerId);
  }

  /** Can the unit END its move here? Friendly-owned, truly empty, or any sea zone for naval. */
  private isStandable(state: GameState, id: string, ownerId: string, category: string | undefined): boolean {
    if (category === 'naval') {
      return id in state.seaZones;
    }
    const region = state.regions[id];
    if (!region) {
      return false;
    }
    if (region.ownerId === ownerId) {
      return true;
    }
    return region.ownerId === null && !state.units.some((u) => u.regionId === id);
  }

  /** Category-specific one-hop neighbours of a location for path-finding (straits included per land/air rules). */
  private oneHopNeighbours(
    state: GameState,
    unit: UnitInstance,
    fromId: string,
    category: string | undefined,
  ): readonly string[] {
    if (category === 'naval') {
      const seaZone = state.seaZones[fromId];
      return seaZone ? seaZone.neighbors.filter((id) => id in state.seaZones) : [];
    }
    const region = state.regions[fromId];
    if (!region) {
      return [];
    }
    const result: string[] = [...region.neighbors];
    for (const strait of state.straits) {
      const otherSide =
        strait.regionA === fromId ? strait.regionB : strait.regionB === fromId ? strait.regionA : null;
      if (!otherSide) {
        continue;
      }
      if (category === 'land') {
        const regionA = state.regions[strait.regionA];
        const regionB = state.regions[strait.regionB];
        if (regionA?.ownerId === unit.ownerId && regionB?.ownerId === unit.ownerId) {
          result.push(otherSide);
        }
      } else {
        result.push(otherSide); // air ignores terrain/strait ownership
      }
    }
    return result;
  }

  /**
   * Breadth-first movement reachability up to the unit's movesRemaining.
   * Produces two maps keyed by region/sea-zone id: `moves` (standable
   * locations the unit can reach, id -> hop cost) and `attacks` (hostile
   * regions it can enter, id -> hop cost of the entering move). Shared by
   * every movement/attack query so legality and movement-point cost can
   * never drift apart.
   */
  private computeReach(
    state: GameState,
    unit: UnitInstance,
    unitCatalog: Readonly<Record<string, UnitDefinition>>,
  ): { moves: Map<string, number>; attacks: Map<string, number> } {
    const category = unitCatalog[unit.unitId]?.category;
    const maxMoves = unit.movesRemaining;
    const distance = new Map<string, number>([[unit.regionId, 0]]);
    const moves = new Map<string, number>();
    const attacks = new Map<string, number>();
    const queue: string[] = [unit.regionId];

    while (queue.length > 0) {
      const current = queue.shift()!;
      const currentDistance = distance.get(current)!;
      if (currentDistance >= maxMoves) {
        continue;
      }
      const nextDistance = currentDistance + 1;
      for (const neighbour of this.oneHopNeighbours(state, unit, current, category)) {
        if (category !== 'naval' && this.isHostileRegion(state, neighbour, unit.ownerId)) {
          const existing = attacks.get(neighbour);
          if (existing === undefined || nextDistance < existing) {
            attacks.set(neighbour, nextDistance);
          }
        }
        if (this.isTraversable(state, neighbour, unit.ownerId, category)) {
          const existing = distance.get(neighbour);
          if (existing === undefined || nextDistance < existing) {
            distance.set(neighbour, nextDistance);
            queue.push(neighbour);
            if (this.isStandable(state, neighbour, unit.ownerId, category)) {
              const existingMove = moves.get(neighbour);
              if (existingMove === undefined || nextDistance < existingMove) {
                moves.set(neighbour, nextDistance);
              }
            }
          }
        }
      }
    }
    return { moves, attacks };
  }
}
