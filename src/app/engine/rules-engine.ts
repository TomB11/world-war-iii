import { GameState } from '../models/game-state.model';
import { PlayerState } from '../models/player.model';
import { Region } from '../models/region.model';
import { UnitDefinition } from '../models/unit.model';
import { UnitInstance } from '../models/unit-instance.model';
import { RegionCombat } from '../models/region-combat.model';
import { Faction } from '../models/faction.model';

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

  /**
   * Whether this player is driven by the AI (Solo Command Mode) rather than
   * a human. Derived from GameState.aiConfig.aiTeamId against the player's
   * Faction.teamId rather than a stored flag on PlayerState, so there is
   * only one source of truth for "who is AI" per game.
   */
  isAiControlled(state: GameState, playerId: string, factions: Readonly<Record<string, Faction>>): boolean {
    const aiTeamId = state.aiConfig?.aiTeamId;
    if (!aiTeamId) {
      return false;
    }
    const player = this.getPlayer(state, playerId);
    if (!player) {
      return false;
    }
    return factions[player.factionId]?.teamId === aiTeamId;
  }

  /**
   * Whether two owners are on the same team (PROJECT_RULES.md section 2's
   * team-victory grouping is also a standing non-aggression pact between
   * teammates — see isHostileRegion/isHostileSeaZone below): the same player
   * always counts as allied with themselves, otherwise their factions'
   * Faction.teamId must match. An unresolvable player/faction id (neither
   * should normally happen) is treated as NOT allied, so an unknown owner
   * still reads as hostile rather than silently exempted.
   */
  private isAllied(
    state: GameState,
    ownerIdA: string,
    ownerIdB: string,
    factions: Readonly<Record<string, Faction>>,
  ): boolean {
    if (ownerIdA === ownerIdB) {
      return true;
    }
    const playerA = this.getPlayer(state, ownerIdA);
    const playerB = this.getPlayer(state, ownerIdB);
    const teamA = playerA ? factions[playerA.factionId]?.teamId : undefined;
    const teamB = playerB ? factions[playerB.factionId]?.teamId : undefined;
    return teamA !== undefined && teamA === teamB;
  }

  /** Public inverse of isAllied, for commands that need to filter defenders/targets down to true hostiles (never a teammate) themselves. */
  isHostileTo(
    state: GameState,
    ownerIdA: string,
    ownerIdB: string,
    factions: Readonly<Record<string, Faction>>,
  ): boolean {
    return !this.isAllied(state, ownerIdA, ownerIdB, factions);
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
  getUnloadDestinations(
    state: GameState,
    embarkedUnit: UnitInstance,
    factions: Readonly<Record<string, Faction>>,
  ): readonly string[] {
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
        return this.isHostileRegion(state, regionId, embarkedUnit.ownerId, factions);
      }
      if (region.ownerId === embarkedUnit.ownerId) {
        return true;
      }
      return region.ownerId === null && !this.isDefendedByHostiles(state, regionId, embarkedUnit.ownerId, factions);
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

  /**
   * Whether `region` is currently a usable factory anchor for `playerId`:
   * owned, has production capacity, and hasn't changed hands to them this
   * very turn — a region needs to be held through a full round before its
   * factory can produce (PROJECT_RULES.md section 18). Doesn't check
   * remaining per-turn deploy capacity — see getRemainingFactoryCapacity.
   */
  isFriendlyFactoryRegion(state: GameState, playerId: string, region: Region | undefined): region is Region {
    return (
      region !== undefined &&
      region.ownerId === playerId &&
      region.factory > 0 &&
      region.capturedOnTurn !== state.turnNumber
    );
  }

  /** How many more units `region`'s factory can produce this Place New Units phase before hitting its capacity (region.factory, PROJECT_RULES.md section 18). */
  getRemainingFactoryCapacity(state: GameState, region: Region): number {
    return Math.max(0, region.factory - (state.unitsDeployedThisTurn[region.id] ?? 0));
  }

  /**
   * Regions (or, for naval units, sea zones adjacent to a qualifying region)
   * where `unitId` could be deployed right now (PROJECT_RULES.md section
   * 18) — used both to validate DeployUnitCommand and to highlight legal
   * drop targets on the map. Always empty for missiles (never deployed to
   * the map, PROJECT_RULES.md section 15).
   */
  getDeployDestinations(
    state: GameState,
    playerId: string,
    unitId: string,
    unitCatalog: Readonly<Record<string, UnitDefinition>>,
  ): readonly string[] {
    const unitDef = unitCatalog[unitId];
    if (!unitDef || unitDef.category === 'missile') {
      return [];
    }
    const hasCapacity = (region: Region): boolean =>
      this.isFriendlyFactoryRegion(state, playerId, region) && this.getRemainingFactoryCapacity(state, region) > 0;

    if (unitDef.category === 'naval') {
      return Object.values(state.seaZones)
        .filter((zone) => zone.adjacentRegionIds.some((id) => hasCapacity(state.regions[id])))
        .map((zone) => zone.id);
    }
    return Object.values(state.regions)
      .filter((region) => hasCapacity(region))
      .map((region) => region.id);
  }

  /** Regions where playerId's units co-locate with at least one hostile (non-allied) owner's units — an unresolved Attack Phase battle (PROJECT_RULES.md sections 7/8/31). Teammates sharing a region/sea zone (e.g. two allies' ships in the same zone) never count as contested. */
  getContestedRegionIds(
    state: GameState,
    playerId: string,
    factions: Readonly<Record<string, Faction>>,
  ): readonly string[] {
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
      if (!owners.has(playerId)) {
        continue;
      }
      const hasHostileOwner = [...owners].some(
        (ownerId) => ownerId !== playerId && !this.isAllied(state, ownerId, playerId, factions),
      );
      if (hasHostileOwner) {
        contested.push(regionId);
      }
    }
    return contested;
  }

  /**
   * Whether a fresh battle in this region should open with the missile
   * sub-phase (PROJECT_RULES.md section 15): a Rocket System of the
   * attacker's declared a supporting strike on this region (recorded in
   * GameState.missileDeclarations by AttackCommand — the launcher itself
   * stays wherever it was, it never physically enters), owned by this
   * player, and their Reserve actually holds at least one missile to fire.
   * False (skip straight to normal combat) if any condition doesn't hold.
   */
  hasPendingMissileStrike(
    state: GameState,
    regionId: string,
    playerId: string,
    unitCatalog: Readonly<Record<string, UnitDefinition>>,
  ): boolean {
    const launcherUnitId = state.missileDeclarations[regionId];
    if (launcherUnitId === undefined) {
      return false;
    }
    const launcher = this.getUnitInstance(state, launcherUnitId);
    if (!launcher || launcher.ownerId !== playerId) {
      return false;
    }
    return this.hasAnyMissileInReserve(state, playerId, unitCatalog);
  }

  /** Whether this player's Reserve holds at least one missile of any type (PROJECT_RULES.md section 15 — a Rocket System can't declare a strike, and a battle can't open one, without a missile to actually fire). */
  hasAnyMissileInReserve(
    state: GameState,
    playerId: string,
    unitCatalog: Readonly<Record<string, UnitDefinition>>,
  ): boolean {
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
      armedMissileUnitId: null,
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
    factions: Readonly<Record<string, Faction>>,
  ): ReadonlyMap<string, number> {
    return this.computeReach(state, unit, unitCatalog, factions).moves;
  }

  /**
   * Regions/sea zones holding hostile units (enemy-owned, or a neutral
   * garrison — PROJECT_RULES.md section 2) this unit can reach and attack
   * this turn, id -> movement-point cost to enter. Land units must path
   * through friendly/empty territory and enter the hostile region on the
   * final hop; air units fly over anything within their movement range;
   * naval units path sea-zone to sea-zone and can attack any reachable sea
   * zone holding a hostile ship (PROJECT_RULES.md section 30 extension —
   * ship-to-ship combat resolves exactly like a land battle, see
   * AttackCommand's naval branch and RulesEngine.isCombatParticipant).
   */
  getReachableAttacks(
    state: GameState,
    unit: UnitInstance,
    unitCatalog: Readonly<Record<string, UnitDefinition>>,
    factions: Readonly<Record<string, Faction>>,
  ): ReadonlyMap<string, number> {
    return this.computeReach(state, unit, unitCatalog, factions).attacks;
  }

  /**
   * Regions a Rocket System may declare a missile strike on this turn
   * (PROJECT_RULES.md section 15/16) — same traversal as any other land
   * unit's attack reach (through friendly/empty territory, hostile only on
   * the final hop), but the hop cap isn't the launcher's own movesRemaining
   * (it never moves) — it's the longest range among missiles currently in
   * the declaring player's Reserve: 1 hop normally, 2 if they hold a Missile
   * B (UnitDefinition.missileRange), data-driven rather than hardcoded.
   */
  getMissileStrikeTargets(
    state: GameState,
    launcher: UnitInstance,
    unitCatalog: Readonly<Record<string, UnitDefinition>>,
    factions: Readonly<Record<string, Faction>>,
  ): ReadonlyMap<string, number> {
    const player = this.getPlayer(state, launcher.ownerId);
    const range = (player?.reserve ?? []).reduce((best, entry) => {
      const def = unitCatalog[entry.unitId];
      if (entry.quantity <= 0 || def?.category !== 'missile') {
        return best;
      }
      return Math.max(best, def.missileRange ?? 1);
    }, 1);
    return this.computeReach(state, launcher, unitCatalog, factions, range).attacks;
  }

  /**
   * Plain-move destinations (PROJECT_RULES.md section 17): reachable
   * regions the mover ALREADY owns — no neutral/empty expansion here, that
   * belongs to Attack Moves. Naval units keep full sea-zone mobility
   * (sea zones have no owner), which is also how MoveUnitCommand lets a
   * transport reposition during Attack Moves (section 7) — this query
   * itself has no phase concept, callers gate which phases it applies to.
   */
  getTacticalMoveDestinations(
    state: GameState,
    unit: UnitInstance,
    unitCatalog: Readonly<Record<string, UnitDefinition>>,
    factions: Readonly<Record<string, Faction>>,
  ): readonly string[] {
    const category = unitCatalog[unit.unitId]?.category;
    const reachable = this.computeReach(state, unit, unitCatalog, factions).moves;
    if (category === 'naval') {
      return [...reachable.keys()];
    }
    return [...reachable.keys()].filter((regionId) => state.regions[regionId]?.ownerId === unit.ownerId);
  }

  /**
   * Attack Moves targets (PROJECT_RULES.md sections 7/8): reachable hostile
   * regions. A Rocket System (canDeclareMissile) doesn't attack by moving in
   * — its "attack" is a missile declaration, so its targets come from
   * getMissileStrikeTargets instead (whatever range its Reserve currently
   * supports, section 16), not this unit's own movement reach.
   */
  getLegalAttackTargets(
    state: GameState,
    unit: UnitInstance,
    unitCatalog: Readonly<Record<string, UnitDefinition>>,
    factions: Readonly<Record<string, Faction>>,
  ): readonly string[] {
    if (unitCatalog[unit.unitId]?.canDeclareMissile) {
      return [...this.getMissileStrikeTargets(state, unit, unitCatalog, factions).keys()];
    }
    return [...this.computeReach(state, unit, unitCatalog, factions).attacks.keys()];
  }

  /** Whether any unit not allied with `ownerId` (a different team, PROJECT_RULES.md section 2) currently sits in `regionId` — enemy defenders, or a neutral garrison. A teammate's units never count, even under a different player id. */
  private isDefendedByHostiles(
    state: GameState,
    regionId: string,
    ownerId: string,
    factions: Readonly<Record<string, Faction>>,
  ): boolean {
    return state.units.some(
      (candidate) => candidate.regionId === regionId && !this.isAllied(state, candidate.ownerId, ownerId, factions),
    );
  }

  private isHostileRegion(
    state: GameState,
    regionId: string,
    ownerId: string,
    factions: Readonly<Record<string, Faction>>,
  ): boolean {
    const region = state.regions[regionId];
    if (!region) {
      return false; // sea zones aren't Regions at all — see isHostileSeaZone for naval attack targeting
    }
    if (region.ownerId !== null && !this.isAllied(state, region.ownerId, ownerId, factions)) {
      return true;
    }
    return this.isDefendedByHostiles(state, regionId, ownerId, factions);
  }

  /**
   * A sea zone counts as a naval attack target if any hostile (non-allied)
   * unit (a ship, or that ship's embarked cargo — always the same owner as
   * the ship, since a transport can only carry its own side's units) is
   * sitting there. Sea zones have no owner, so unlike isHostileRegion there's
   * no ownership-based branch — pure presence (of a non-teammate) is the
   * whole rule; two allies' ships may freely share a zone.
   */
  private isHostileSeaZone(
    state: GameState,
    seaZoneId: string,
    ownerId: string,
    factions: Readonly<Record<string, Faction>>,
  ): boolean {
    return state.units.some(
      (candidate) => candidate.regionId === seaZoneId && !this.isAllied(state, candidate.ownerId, ownerId, factions),
    );
  }

  /**
   * Whether this unit actually fights in a naval battle (PROJECT_RULES.md
   * section 8, naval extension): a unit not currently embarked always
   * fights (this covers every land-region battle, and every ship in a sea
   * zone). A unit that IS embarked (transportedBy set) only fights if it's
   * an air unit (a carried Fighter/Helicopter still flies combat air
   * patrol) — embarked land/support cargo (Infantry, Tank, Rocket System...)
   * rides along but never rolls dice or can be chosen as a casualty; if its
   * transport is sunk, it goes down with it (RemoveCasualtyCommand).
   */
  isCombatParticipant(unit: UnitInstance, unitCatalog: Readonly<Record<string, UnitDefinition>>): boolean {
    if (unit.transportedBy === null) {
      return true;
    }
    return unitCatalog[unit.unitId]?.category === 'air';
  }

  /** Can a path pass THROUGH this location? Air flies over anything; land needs friendly/empty; naval needs a sea zone free of hostile (non-allied) ships (a plain move can't sail through/into a contested zone — that's what AttackCommand's naval branch is for). */
  private isTraversable(
    state: GameState,
    id: string,
    ownerId: string,
    category: string | undefined,
    factions: Readonly<Record<string, Faction>>,
  ): boolean {
    if (category === 'naval') {
      return id in state.seaZones && !this.isHostileSeaZone(state, id, ownerId, factions);
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
    return region.ownerId === null && !this.isDefendedByHostiles(state, id, ownerId, factions);
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
    factions: Readonly<Record<string, Faction>>,
    maxMovesOverride?: number,
  ): { moves: Map<string, number>; attacks: Map<string, number> } {
    const category = unitCatalog[unit.unitId]?.category;
    const maxMoves = maxMovesOverride ?? unit.movesRemaining;
    const distance = new Map<string, number>([[unit.regionId, 0]]);
    const moves = new Map<string, number>();
    const attacks = new Map<string, number>();
    const queue: string[] = [unit.regionId];

    while (queue.length > 0) {
      const current = queue.shift();
      if (current === undefined) {
        break;
      }
      const currentDistance = distance.get(current);
      if (currentDistance === undefined || currentDistance >= maxMoves) {
        continue;
      }
      const nextDistance = currentDistance + 1;
      for (const neighbour of this.oneHopNeighbours(state, unit, current, category)) {
        const isHostileTarget =
          category === 'naval'
            ? this.isHostileSeaZone(state, neighbour, unit.ownerId, factions)
            : this.isHostileRegion(state, neighbour, unit.ownerId, factions);
        if (isHostileTarget) {
          const existing = attacks.get(neighbour);
          if (existing === undefined || nextDistance < existing) {
            attacks.set(neighbour, nextDistance);
          }
        }
        if (this.isTraversable(state, neighbour, unit.ownerId, category, factions)) {
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
