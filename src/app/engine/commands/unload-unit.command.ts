import { Command, CommandResult } from '../../interfaces/command';
import { GameState } from '../../models/game-state.model';
import { GameEngineEvent } from '../../interfaces/game-events';
import { UnitDefinition } from '../../models/unit.model';
import { UnitInstance } from '../../models/unit-instance.model';
import { EconomyConfig } from '../../models/economy-config.model';
import { RulesEngine } from '../rules-engine';
import { applyForceCaptureSatisfactionPenalty } from './shared/capture-penalties';

/**
 * Disembarks a unit from its transport onto a coastal region bordering the
 * transport's sea zone (PROJECT_RULES.md section 30), costing the unit one
 * movement point (the landing IS its move for the turn). Phase-dependent:
 * - Tactical Moves: a peaceful landing onto a friendly or empty coast.
 * - Attack Moves: an amphibious ASSAULT onto a hostile coast (section 7) —
 *   undefended coast is captured, defended coast becomes contested (both
 *   armies co-locate), exactly like a land attack (section 8). A unit that
 *   can't capture alone (Helicopter) can't take an undefended coast by
 *   itself. The valid landing set for each phase comes from
 *   RulesEngine.getUnloadDestinations.
 */
export class UnloadUnitCommand implements Command {
  readonly type = 'UnloadUnit';

  constructor(
    private readonly playerId: string,
    private readonly unitInstanceId: string,
    private readonly destinationRegionId: string,
    private readonly unitCatalog: Readonly<Record<string, UnitDefinition>>,
    private readonly economyConfig: EconomyConfig,
    private readonly rules: RulesEngine = new RulesEngine(),
  ) {}

  execute(state: GameState): CommandResult {
    const reject = (reason: string): CommandResult => ({
      state,
      events: [{ type: 'MovementRejected', playerId: this.playerId, reason }],
    });

    if (state.phase !== 'attackMoves' && state.phase !== 'tacticalMoves') {
      return reject('Unloading is only allowed during the Attack Moves or Tactical Moves phase');
    }

    if (state.activePlayerId !== this.playerId) {
      return reject('It is not your turn');
    }

    const unit = this.rules.getUnitInstance(state, this.unitInstanceId);
    if (!unit || unit.ownerId !== this.playerId) {
      return reject(`Unknown unit "${this.unitInstanceId}"`);
    }

    if (unit.transportedBy === null) {
      return reject('Unit is not embarked');
    }

    if (unit.movesRemaining <= 0) {
      return reject('This unit has no movement remaining to disembark this turn');
    }

    if (!this.rules.getUnloadDestinations(state, unit).includes(this.destinationRegionId)) {
      return reject('This unit has no valid landing here');
    }

    const targetRegion = state.regions[this.destinationRegionId];
    if (!targetRegion) {
      return reject(`Unknown region "${this.destinationRegionId}"`);
    }

    const defenders = state.units.filter(
      (candidate) => candidate.regionId === this.destinationRegionId && candidate.ownerId !== this.playerId,
    );
    const isAmphibiousAssault = state.phase === 'attackMoves';

    // The disembarking unit always leaves the transport, lands in the target
    // region, spends one movement point, and (on an assault) is marked as
    // having fought this turn.
    const disembark = (candidate: UnitInstance): UnitInstance =>
      candidate.id === this.unitInstanceId
        ? {
            ...candidate,
            transportedBy: null,
            regionId: this.destinationRegionId,
            movesRemaining: candidate.movesRemaining - 1,
            hasFoughtThisTurn: isAmphibiousAssault ? true : candidate.hasFoughtThisTurn,
          }
        : candidate;

    // PEACEFUL landing (Tactical Moves): friendly/empty coast, no combat.
    if (!isAmphibiousAssault) {
      return {
        state: { ...state, units: state.units.map(disembark) },
        events: [{ type: 'UnitUnloaded', unitInstanceId: this.unitInstanceId }],
      };
    }

    const unitDef = this.unitCatalog[unit.unitId];

    // AMPHIBIOUS ASSAULT onto a DEFENDED coast: contest (co-locate).
    if (defenders.length > 0) {
      return {
        state: { ...state, units: state.units.map(disembark) },
        events: [
          { type: 'UnitUnloaded', unitInstanceId: this.unitInstanceId },
          { type: 'RegionContested', playerId: this.playerId, regionId: this.destinationRegionId },
        ],
      };
    }

    // AMPHIBIOUS ASSAULT onto an UNDEFENDED coast: this unit must be able to
    // take ground on its own (Helicopters can't, section 22).
    if (unitDef?.canCapture === false) {
      return reject(`${unitDef.name} units cannot capture a region on their own`);
    }

    // UNDEFENDED capture: flip ownership + by-force Citizen penalties (section 5).
    const previousOwnerId = targetRegion.ownerId;
    const nextPlayers = applyForceCaptureSatisfactionPenalty(
      state.players,
      this.playerId,
      previousOwnerId,
      this.economyConfig,
    );

    const events: readonly GameEngineEvent[] = [
      { type: 'UnitUnloaded', unitInstanceId: this.unitInstanceId },
      { type: 'RegionCaptured', playerId: this.playerId, regionId: this.destinationRegionId, previousOwnerId },
    ];
    return {
      state: {
        ...state,
        regions: { ...state.regions, [this.destinationRegionId]: { ...targetRegion, ownerId: this.playerId } },
        units: state.units.map(disembark),
        players: nextPlayers,
      },
      events,
    };
  }
}
