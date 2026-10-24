import { Command, CommandResult } from '../../interfaces/command';
import { GameState } from '../../models/game-state.model';
import { GameEngineEvent } from '../../interfaces/game-events';
import { EconomyConfig } from '../../models/economy-config.model';
import { clamp } from '../../core/utils/math.util';
import { RulesEngine } from '../rules-engine';

/**
 * Undoes a unit's most recent Attack Moves Phase attack (see AttackRecord)
 * any time before the phase is advanced: the unit goes back where it came
 * from with its movement points and "has fought" flag restored (embarked
 * cargo sails back with it), a captured region returns to its previous owner
 * with the by-force Citizen Satisfaction penalties reversed, and a declared
 * missile strike is withdrawn. RulesEngine.checkCancelAttack decides whether
 * it is allowed, so the UI can offer exactly what this accepts.
 */
export class CancelAttackCommand implements Command {
  readonly type = 'CancelAttack';

  constructor(
    private readonly playerId: string,
    private readonly unitInstanceId: string,
    private readonly economyConfig: EconomyConfig,
    private readonly rules: RulesEngine = new RulesEngine(),
  ) {}

  execute(state: GameState): CommandResult {
    const reject = (reason: string): CommandResult => ({
      state,
      events: [{ type: 'MovementRejected', playerId: this.playerId, reason }],
    });

    if (state.activePlayerId !== this.playerId) {
      return reject('It is not your turn');
    }
    const unit = this.rules.getUnitInstance(state, this.unitInstanceId);
    if (!unit || unit.ownerId !== this.playerId) {
      return reject(`Unknown unit "${this.unitInstanceId}"`);
    }
    const check = this.rules.checkCancelAttack(state, this.unitInstanceId);
    if (check.record === null) {
      return reject(check.reason);
    }
    const record = check.record;

    const lastIndex = state.attackRecords.lastIndexOf(record);
    const attackRecords = state.attackRecords.filter((_, index) => index !== lastIndex);

    const events: GameEngineEvent[] = [
      {
        type: 'AttackCancelled',
        playerId: this.playerId,
        unitInstanceId: this.unitInstanceId,
        kind: record.kind,
        fromRegionId: record.fromRegionId,
        toRegionId: record.toRegionId,
      },
    ];

    if (record.kind === 'missile') {
      const { [record.toRegionId]: _withdrawn, ...missileDeclarations } = state.missileDeclarations;
      return {
        state: {
          ...state,
          units: state.units.map((candidate) =>
            candidate.id === this.unitInstanceId ? { ...candidate, hasFoughtThisTurn: record.hadFoughtBefore } : candidate,
          ),
          missileDeclarations,
          attackRecords,
        },
        events,
      };
    }

    const units = state.units.map((candidate) => {
      if (candidate.id === this.unitInstanceId) {
        return {
          ...candidate,
          regionId: record.fromRegionId,
          movesRemaining: record.movesBefore,
          hasFoughtThisTurn: record.hadFoughtBefore,
        };
      }
      return candidate.transportedBy === this.unitInstanceId ? { ...candidate, regionId: record.fromRegionId } : candidate;
    });

    let regions = state.regions;
    let players = state.players;
    if (record.kind === 'capture') {
      const region = state.regions[record.toRegionId];
      if (region) {
        const { capturedOnTurn: _stamp, ...regionWithoutStamp } = region;
        regions = {
          ...state.regions,
          [record.toRegionId]: {
            ...regionWithoutStamp,
            ownerId: record.previousOwnerId ?? null,
            ...(record.previousCapturedOnTurn !== undefined ? { capturedOnTurn: record.previousCapturedOnTurn } : {}),
          },
        };
      }
      const delta = record.satisfactionDelta ?? {};
      players = state.players.map((candidate) => {
        const change = delta[candidate.id];
        return change === undefined
          ? candidate
          : {
              ...candidate,
              citizenSatisfaction: clamp(
                candidate.citizenSatisfaction - change,
                this.economyConfig.citizenSatisfactionMin,
                this.economyConfig.citizenSatisfactionMax,
              ),
            };
      });
    }

    return { state: { ...state, units, regions, players, attackRecords }, events };
  }
}
