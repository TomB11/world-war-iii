import { Command, CommandResult } from '../../interfaces/command';
import { GameState } from '../../models/game-state.model';
import { GameEngineEvent } from '../../interfaces/game-events';
import { UnitDefinition } from '../../models/unit.model';
import { RulesEngine } from '../rules-engine';
import { hasInterceptor, resolveMissileStrike } from './shared/missile-resolution';
import { chooseCasualtyUnit } from '../ai/ai-casualty-choice.util';

/**
 * Solo Command Mode's Threat Track "free missile strike" bonus (rulebook
 * section 7, threshold 9): a stand-alone bombardment, deliberately NOT woven
 * into the normal RegionCombat/SelectMissile/FireMissile state machine —
 * that machine only ever opens once this player's own units are already
 * physically fighting in the target region (AttackCommand's rule that a
 * Rocket System can only support a battle its own side has already opened),
 * which a "free" bonus strike from nowhere doesn't satisfy. Instead this
 * resolves entirely in one dispatch: consumes one missile from Reserve,
 * rolls interception/hit (engine/commands/shared/missile-resolution.ts,
 * shared with FireMissileCommand), and on a hit removes one defending unit
 * immediately (no separate casualty-choice dispatch needed) — a missile
 * strike alone never captures territory, exactly like a normal one.
 */
export class ApplyFreeMissileStrikeCommand implements Command {
  readonly type = 'ApplyFreeMissileStrike';

  constructor(
    private readonly playerId: string,
    private readonly targetRegionId: string,
    private readonly unitCatalog: Readonly<Record<string, UnitDefinition>>,
    private readonly rules: RulesEngine = new RulesEngine(),
  ) {}

  execute(state: GameState): CommandResult {
    const player = this.rules.getPlayer(state, this.playerId);
    if (!player) {
      return { state, events: [] };
    }

    const missileEntry = player.reserve.find((entry) => {
      const def = this.unitCatalog[entry.unitId];
      return def?.category === 'missile' && entry.quantity > 0;
    });
    const missileDef = missileEntry ? this.unitCatalog[missileEntry.unitId] : undefined;
    if (!missileEntry || !missileDef) {
      return { state, events: [] };
    }

    const defenders = this.rules.getUnitsInRegion(state, this.targetRegionId).filter((unit) => unit.ownerId !== this.playerId);
    if (defenders.length === 0) {
      return { state, events: [] };
    }

    const interceptorPresent = hasInterceptor(state, this.targetRegionId, this.playerId, this.unitCatalog);
    const resolution = resolveMissileStrike(state.randomSeed, missileDef.attack, interceptorPresent);

    const nextPlayers = state.players.map((candidate) =>
      candidate.id === this.playerId
        ? {
            ...candidate,
            reserve: candidate.reserve
              .map((entry) => (entry.unitId === missileEntry.unitId ? { ...entry, quantity: entry.quantity - 1 } : entry))
              .filter((entry) => entry.quantity > 0),
          }
        : candidate,
    );

    let nextUnits = state.units;
    let destroyedUnitInstanceId: string | null = null;
    if (resolution.outcome === 'hit') {
      destroyedUnitInstanceId = chooseCasualtyUnit(defenders, this.unitCatalog);
      nextUnits = state.units.filter((unit) => unit.id !== destroyedUnitInstanceId);
    }

    const events: readonly GameEngineEvent[] = [
      {
        type: 'FreeMissileStrikeResolved',
        playerId: this.playerId,
        targetRegionId: this.targetRegionId,
        missileId: missileEntry.unitId,
        outcome: resolution.outcome,
        destroyedUnitInstanceId,
      },
    ];
    return {
      state: { ...state, randomSeed: resolution.nextSeed, players: nextPlayers, units: nextUnits },
      events,
    };
  }
}
