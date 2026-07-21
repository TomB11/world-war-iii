import { Command, CommandResult } from '../../interfaces/command';
import { GameState } from '../../models/game-state.model';
import { GameEngineEvent } from '../../interfaces/game-events';
import { UnitDefinition } from '../../models/unit.model';
import { RulesEngine } from '../rules-engine';

/**
 * Moves one unit into friendly territory during the Tactical Moves phase —
 * the "non-combat move" (PROJECT_RULES.md section 17). Attack Moves is
 * attack-only (section 7): you never make a plain move into your own
 * territory then, so this command is valid ONLY during Tactical Moves.
 * A unit may reach any standable region within its movement allowance
 * (multi-hop — a Fighter can travel up to 4 regions), and the move consumes
 * that many movement points. Units that fought this turn cannot Tactical
 * Move. Any units it is transporting move with it; embarked units cannot be
 * moved independently — unload first.
 */
export class MoveUnitCommand implements Command {
  readonly type = 'MoveUnit';

  constructor(
    private readonly playerId: string,
    private readonly unitInstanceId: string,
    private readonly destinationRegionId: string,
    private readonly unitCatalog: Readonly<Record<string, UnitDefinition>>,
    private readonly rules: RulesEngine = new RulesEngine(),
  ) {}

  execute(state: GameState): CommandResult {
    const reject = (reason: string): CommandResult => ({
      state,
      events: [{ type: 'MovementRejected', playerId: this.playerId, reason }],
    });

    if (state.phase !== 'tacticalMoves') {
      return reject('Plain moves are only allowed during the Tactical Moves phase');
    }

    if (state.activePlayerId !== this.playerId) {
      return reject('It is not your turn');
    }

    const unit = this.rules.getUnitInstance(state, this.unitInstanceId);
    if (!unit || unit.ownerId !== this.playerId) {
      return reject(`Unknown unit "${this.unitInstanceId}"`);
    }

    if (unit.transportedBy !== null) {
      return reject('Embarked units must be unloaded before moving');
    }

    if (unit.movesRemaining <= 0) {
      return reject('This unit has no movement remaining');
    }

    if (unit.hasFoughtThisTurn) {
      return reject('Units that attacked this turn cannot make Tactical Moves');
    }

    const reachable = this.rules.getReachableMoves(state, unit, this.unitCatalog);
    const cost = reachable.get(this.destinationRegionId);
    const isFriendly = state.regions[this.destinationRegionId]?.ownerId === unit.ownerId;
    const isSeaZone = this.destinationRegionId in state.seaZones;
    if (cost === undefined || !(isFriendly || isSeaZone)) {
      return reject(`"${this.destinationRegionId}" is not a legal destination for this unit`);
    }

    const fromRegionId = unit.regionId;
    const nextUnits = state.units.map((candidate) => {
      if (candidate.id === this.unitInstanceId) {
        return { ...candidate, regionId: this.destinationRegionId, movesRemaining: candidate.movesRemaining - cost };
      }
      if (candidate.transportedBy === this.unitInstanceId) {
        return { ...candidate, regionId: this.destinationRegionId };
      }
      return candidate;
    });

    const events: readonly GameEngineEvent[] = [
      {
        type: 'UnitMoved',
        unitInstanceId: this.unitInstanceId,
        fromRegionId,
        toRegionId: this.destinationRegionId,
      },
    ];
    return { state: { ...state, units: nextUnits }, events };
  }
}
