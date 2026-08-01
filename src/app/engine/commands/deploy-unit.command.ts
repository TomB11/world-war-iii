import { Command, CommandResult } from '../../interfaces/command';
import { GameState } from '../../models/game-state.model';
import { Region } from '../../models/region.model';
import { GameEngineEvent } from '../../interfaces/game-events';
import { UnitDefinition } from '../../models/unit.model';
import { RulesEngine } from '../rules-engine';

/**
 * Deploys one unit from the player's Reserve onto the map (PROJECT_RULES.md
 * sections 18, 35, 37). Only valid during the Place New Units Phase.
 * Naval units (category 'naval') deploy into a sea zone adjacent to a
 * factory region the player controls — everything else deploys directly at
 * a factory region the player controls. Missiles (category 'missile') can
 * never be deployed at all — they have no physical presence on the map and
 * stay in Reserve until fired by a Rocket System (section 15).
 *
 * Two additional per-region limits (PROJECT_RULES.md section 18): a region
 * captured this very turn can't produce yet — it needs to be held through a
 * full round first (RulesEngine.isFriendlyFactoryRegion) — and a region's
 * factory can only produce up to `factory` units per Place New Units phase
 * (RulesEngine.getRemainingFactoryCapacity), tracked via
 * GameState.unitsDeployedThisTurn and reset on entering the phase
 * (AdvancePhaseCommand).
 */
export class DeployUnitCommand implements Command {
  readonly type = 'DeployUnit';

  constructor(
    private readonly playerId: string,
    private readonly unitId: string,
    private readonly regionId: string,
    private readonly unitCatalog: Readonly<Record<string, UnitDefinition>>,
    private readonly rules: RulesEngine = new RulesEngine(),
  ) {}

  execute(state: GameState): CommandResult {
    const reject = (reason: string): CommandResult => ({
      state,
      events: [{ type: 'MovementRejected', playerId: this.playerId, reason }],
    });

    if (state.phase !== 'placeNewUnits') {
      return reject('Deployment is only allowed during the Place New Units phase');
    }

    if (state.activePlayerId !== this.playerId) {
      return reject('It is not your turn');
    }

    const player = this.rules.getPlayer(state, this.playerId);
    if (!player) {
      return reject(`Unknown player "${this.playerId}"`);
    }

    const unitDef = this.unitCatalog[this.unitId];
    if (!unitDef) {
      return reject(`Unknown unit "${this.unitId}"`);
    }

    if (unitDef.category === 'missile') {
      return reject(
        'Missiles are never deployed to the map — they stay in Reserve until a Rocket System fires one (PROJECT_RULES.md section 15)',
      );
    }

    let sourceFactoryRegionId: string;
    if (unitDef.category === 'naval') {
      const seaZone = state.seaZones[this.regionId];
      if (!seaZone) {
        return reject('Naval units may only be deployed to a sea zone');
      }
      const friendlyFactoryRegions = seaZone.adjacentRegionIds
        .map((id) => state.regions[id])
        .filter((candidate): candidate is Region => this.rules.isFriendlyFactoryRegion(state, this.playerId, candidate));
      if (friendlyFactoryRegions.length === 0) {
        return reject(
          'You may only deploy naval units to a sea zone adjacent to a factory region you control that you have held since before this turn',
        );
      }
      const sourceRegion = friendlyFactoryRegions.find(
        (candidate) => this.rules.getRemainingFactoryCapacity(state, candidate) > 0,
      );
      if (!sourceRegion) {
        return reject('No adjacent factory has any production capacity left this turn');
      }
      sourceFactoryRegionId = sourceRegion.id;
    } else {
      const region = this.rules.getRegion(state, this.regionId);
      if (!region || region.ownerId !== this.playerId || region.factory <= 0) {
        return reject('You may only deploy at a factory region you control');
      }
      if (region.capturedOnTurn === state.turnNumber) {
        return reject(`${region.name} was just captured — it must be held for a full turn before it can produce units`);
      }
      if (this.rules.getRemainingFactoryCapacity(state, region) <= 0) {
        return reject(`${region.name}'s factory can only produce ${region.factory} unit(s) per turn`);
      }
      sourceFactoryRegionId = region.id;
    }

    const reserveEntry = player.reserve.find((entry) => entry.unitId === this.unitId);
    if (!reserveEntry || reserveEntry.quantity <= 0) {
      return reject(`No "${this.unitId}" units available in Reserve`);
    }

    const nextPlayers = state.players.map((candidate) =>
      candidate.id === this.playerId
        ? {
            ...candidate,
            reserve: candidate.reserve
              .map((entry) =>
                entry.unitId === this.unitId ? { ...entry, quantity: entry.quantity - 1 } : entry,
              )
              .filter((entry) => entry.quantity > 0),
          }
        : candidate,
    );

    const unitInstanceId = `unit-${state.nextUnitInstanceId}`;
    const nextUnits = [
      ...state.units,
      {
        id: unitInstanceId,
        unitId: this.unitId,
        ownerId: this.playerId,
        regionId: this.regionId,
        movesRemaining: unitDef.movement,
        transportedBy: null,
        hasFoughtThisTurn: false,
      },
    ];

    const events: readonly GameEngineEvent[] = [
      {
        type: 'UnitDeployed',
        playerId: this.playerId,
        unitInstanceId,
        unitId: this.unitId,
        regionId: this.regionId,
      },
    ];
    return {
      state: {
        ...state,
        players: nextPlayers,
        units: nextUnits,
        nextUnitInstanceId: state.nextUnitInstanceId + 1,
        unitsDeployedThisTurn: {
          ...state.unitsDeployedThisTurn,
          [sourceFactoryRegionId]: (state.unitsDeployedThisTurn[sourceFactoryRegionId] ?? 0) + 1,
        },
      },
      events,
    };
  }
}
