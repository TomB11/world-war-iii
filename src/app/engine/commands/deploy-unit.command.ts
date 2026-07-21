import { Command, CommandResult } from '../../interfaces/command';
import { GameState } from '../../models/game-state.model';
import { GameEngineEvent } from '../../interfaces/game-events';
import { UnitDefinition } from '../../models/unit.model';
import { RulesEngine } from '../rules-engine';

/**
 * Deploys one unit from the player's Reserve onto the map (PROJECT_RULES.md
 * sections 18, 35, 37). Only valid during the Place New Units Phase.
 * Naval units (category 'naval') deploy into a sea zone adjacent to a
 * factory region the player controls — everything else deploys directly at
 * a factory region the player controls.
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

    if (unitDef.category === 'naval') {
      const seaZone = state.seaZones[this.regionId];
      if (!seaZone) {
        return reject('Naval units may only be deployed to a sea zone');
      }
      const hasFriendlyFactory = seaZone.adjacentRegionIds.some((id) => {
        const adjacent = state.regions[id];
        return adjacent !== undefined && adjacent.ownerId === this.playerId && adjacent.factory > 0;
      });
      if (!hasFriendlyFactory) {
        return reject('You may only deploy naval units to a sea zone adjacent to a factory region you control');
      }
    } else {
      const region = this.rules.getRegion(state, this.regionId);
      if (!region || region.ownerId !== this.playerId || region.factory <= 0) {
        return reject('You may only deploy at a factory region you control');
      }
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
      },
      events,
    };
  }
}
