import { Command, CommandResult } from '../../interfaces/command';
import { GameState } from '../../models/game-state.model';
import { GameEngineEvent } from '../../interfaces/game-events';
import { UnitDefinition } from '../../models/unit.model';
import { RulesEngine } from '../rules-engine';
import { MOVEMENT_PHASES } from '../../core/constants/game.constants';

/**
 * Embarks a unit onto a transport in the same region (PROJECT_RULES.md
 * sections 24/28-30). Capacity is typed: land/support units use the
 * transport's land slots, air units (Fighter, Helicopter) use its air
 * slots — so a Land Transport carries land units + 1 air, an Aircraft
 * Carrier carries only air, and a Stealth Boat 1 land or 1 air. Embarked
 * units move with the transport and cannot move independently. Nesting
 * transports inside transports is not allowed.
 *
 * SIMPLIFICATIONS vs the manual: the Stealth Boat's "1 land XOR 1 heli"
 * (section 24) is modelled as 1 land slot + 1 air slot (so it could hold
 * both, one more than the manual's exclusive-or), and the Destroyer's
 * "carries 2 Rocket Systems" (section 25) is deferred with the missile
 * system it depends on.
 */
export class LoadUnitCommand implements Command {
  readonly type = 'LoadUnit';

  constructor(
    private readonly playerId: string,
    private readonly unitInstanceId: string,
    private readonly transportInstanceId: string,
    private readonly unitCatalog: Readonly<Record<string, UnitDefinition>>,
    private readonly rules: RulesEngine = new RulesEngine(),
  ) {}

  execute(state: GameState): CommandResult {
    const reject = (reason: string): CommandResult => ({
      state,
      events: [{ type: 'MovementRejected', playerId: this.playerId, reason }],
    });

    if (!MOVEMENT_PHASES.includes(state.phase)) {
      return reject('Loading is only allowed during the Attack Moves or Tactical Moves phase');
    }

    if (state.activePlayerId !== this.playerId) {
      return reject('It is not your turn');
    }

    const unit = this.rules.getUnitInstance(state, this.unitInstanceId);
    const transport = this.rules.getUnitInstance(state, this.transportInstanceId);
    if (!unit || unit.ownerId !== this.playerId || !transport || transport.ownerId !== this.playerId) {
      return reject('Unknown unit or transport');
    }

    if (unit.transportedBy !== null) {
      return reject('Unit is already embarked');
    }

    // A transport is a naval vessel sitting in a sea zone; a land/air unit
    // boards it from a coastal region bordering that sea zone (or, as a
    // fallback, from the exact same location). PROJECT_RULES.md section 30.
    const transportSeaZone = state.seaZones[transport.regionId];
    const boardsFromAdjacentCoast =
      transportSeaZone !== undefined && transportSeaZone.adjacentRegionIds.includes(unit.regionId);
    if (unit.regionId !== transport.regionId && !boardsFromAdjacentCoast) {
      return reject('The transport must be in a sea zone bordering the unit to load it');
    }

    const unitDef = this.unitCatalog[unit.unitId];
    const transportDef = this.unitCatalog[transport.unitId];
    if (!unitDef || !transportDef || transportDef.transportCapacity <= 0) {
      return reject('Target is not a transport');
    }

    if (unitDef.transportCapacity > 0) {
      return reject('Transports cannot be loaded onto other transports');
    }

    // Which slot type does this passenger need? Air units (Fighter,
    // Helicopter) land on air slots; land/support units use land slots.
    const isAirPassenger = unitDef.category === 'air';
    const isLandPassenger = unitDef.category === 'land' || unitDef.category === 'support';
    if (!isAirPassenger && !isLandPassenger) {
      return reject(`${unitDef.name} cannot be transported`);
    }

    const landCapacity = transportDef.transportLandCapacity ?? 0;
    const airCapacity = transportDef.transportAirCapacity ?? 0;
    const capacity = isAirPassenger ? airCapacity : landCapacity;
    if (capacity <= 0) {
      return reject(`${transportDef.name} cannot carry ${isAirPassenger ? 'air' : 'land'} units`);
    }

    // Fighters can only land on a carrier (PROJECT_RULES.md section 26);
    // Helicopters can use any air-capable transport (section 22).
    if (isAirPassenger && unitDef.requiresCarrier && !transportDef.transportAcceptsFighters) {
      return reject(`${unitDef.name} can only be carried by an Aircraft Carrier`);
    }

    const occupied = state.units.filter((u) => {
      if (u.transportedBy !== this.transportInstanceId) {
        return false;
      }
      const embarkedDef = this.unitCatalog[u.unitId];
      const embarkedIsAir = embarkedDef?.category === 'air';
      return isAirPassenger ? embarkedIsAir : !embarkedIsAir;
    }).length;
    if (occupied >= capacity) {
      return reject(`${transportDef.name} has no free ${isAirPassenger ? 'air' : 'land'} slots`);
    }

    // The passenger boards the ship: it now rides in the transport's sea
    // zone and moves with it (MoveUnitCommand keeps embarked units in sync).
    const nextUnits = state.units.map((candidate) =>
      candidate.id === this.unitInstanceId
        ? { ...candidate, transportedBy: this.transportInstanceId, regionId: transport.regionId }
        : candidate,
    );

    const events: readonly GameEngineEvent[] = [
      {
        type: 'UnitLoaded',
        unitInstanceId: this.unitInstanceId,
        transportInstanceId: this.transportInstanceId,
      },
    ];
    return { state: { ...state, units: nextUnits }, events };
  }
}
