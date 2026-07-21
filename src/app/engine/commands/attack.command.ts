import { Command, CommandResult } from '../../interfaces/command';
import { GameState } from '../../models/game-state.model';
import { GameEngineEvent } from '../../interfaces/game-events';
import { UnitDefinition } from '../../models/unit.model';
import { UnitInstance } from '../../models/unit-instance.model';
import { EconomyConfig } from '../../models/economy-config.model';
import { RulesEngine } from '../rules-engine';
import { applyForceCaptureSatisfactionPenalty } from './shared/capture-penalties';

/**
 * Moves a unit into a neighboring enemy/neutral region during the Attack
 * Moves Phase — the "combat move" (PROJECT_RULES.md section 7): this is how
 * a unit enters hostile territory, and combat resolution against whatever
 * is there belongs to the following Attack Phase (section 8). This is a
 * basic vertical slice: if the target region has no defending units, it's
 * captured immediately (section 31 — ownership changes once all defenders
 * are destroyed, trivially true when there were zero to begin with). If the
 * target IS defended, the move is rejected — full dice-based combat
 * resolution against a defended region is Phase 6 future work, not faked
 * here, so for now the Attack Phase itself has nothing left to resolve.
 * A successful entry consumes one movement point and marks the unit as
 * having fought this turn (PROJECT_RULES.md section 17), which excludes
 * it from Tactical Moves. A capture by force also drops Citizen
 * Satisfaction for both sides (PROJECT_RULES.md section 5): the attacker
 * loses captureSatisfactionPenaltyAttacker, and whoever previously owned
 * the region (if anyone) loses captureSatisfactionPenaltyDefender.
 *
 * Two per-unit exceptions (PROJECT_RULES.md sections 21/22): a unit with
 * canCapture:false (Helicopter) can never complete a capture, even of an
 * undefended region; a unit with captureThrough:true (Tank) isn't blocked
 * by hasFoughtThisTurn from attacking again the same Attack Phase after a
 * successful capture, so it can chain into a second undefended region —
 * naturally capped at 2 by its movement allowance.
 */
export class AttackCommand implements Command {
  readonly type = 'Attack';

  constructor(
    private readonly playerId: string,
    private readonly unitInstanceId: string,
    private readonly targetRegionId: string,
    private readonly unitCatalog: Readonly<Record<string, UnitDefinition>>,
    private readonly economyConfig: EconomyConfig,
    private readonly rules: RulesEngine = new RulesEngine(),
  ) {}

  execute(state: GameState): CommandResult {
    const reject = (reason: string): CommandResult => ({
      state,
      events: [{ type: 'MovementRejected', playerId: this.playerId, reason }],
    });

    if (state.phase !== 'attackMoves') {
      return reject('Units may only move into enemy regions during the Attack Moves phase');
    }

    if (state.activePlayerId !== this.playerId) {
      return reject('It is not your turn');
    }

    const unit = this.rules.getUnitInstance(state, this.unitInstanceId);
    if (!unit || unit.ownerId !== this.playerId) {
      return reject(`Unknown unit "${this.unitInstanceId}"`);
    }

    if (unit.transportedBy !== null) {
      return reject('Embarked units must be unloaded before attacking');
    }

    const unitDef = this.unitCatalog[unit.unitId];
    if (!unitDef) {
      return reject('Unknown unit');
    }
    // A unit with no attack value normally can't declare an attack move at
    // all — except a Rocket System moving into a DEFENDED region, which is
    // how a missile strike is declared (PROJECT_RULES.md section 15). It
    // deals no damage itself; the Attack Phase's missile sub-phase is what
    // actually resolves the strike once this move lands it there.
    const isDefendedTargetForMissile =
      unitDef.canDeclareMissile &&
      state.units.some((candidate) => candidate.regionId === this.targetRegionId && candidate.ownerId !== this.playerId);
    if (unitDef.attack <= 0 && !isDefendedTargetForMissile) {
      return reject('This unit has no attack capability');
    }

    if (unit.hasFoughtThisTurn && !unitDef.captureThrough) {
      return reject('This unit has already attacked this turn');
    }

    if (unit.movesRemaining <= 0) {
      return reject('This unit has no movement remaining');
    }

    const attackReach = this.rules.getReachableAttacks(state, unit, this.unitCatalog);
    const cost = attackReach.get(this.targetRegionId);
    if (cost === undefined) {
      return reject(`"${this.targetRegionId}" is not a legal attack target for this unit`);
    }

    const targetRegion = state.regions[this.targetRegionId];
    if (!targetRegion) {
      return reject(`Unknown region "${this.targetRegionId}"`);
    }

    const defenders = state.units.filter(
      (candidate) => candidate.regionId === this.targetRegionId && candidate.ownerId !== this.playerId,
    );

    // The attacking unit always moves into the target region (that IS the
    // combat move, PROJECT_RULES.md section 7), is marked as having fought,
    // and pays its path cost in movement points.
    const movedAttacker = (candidate: UnitInstance): UnitInstance =>
      candidate.id === this.unitInstanceId
        ? {
            ...candidate,
            regionId: this.targetRegionId,
            movesRemaining: candidate.movesRemaining - cost,
            hasFoughtThisTurn: true,
          }
        : candidate;

    // DEFENDED: co-locate with the defenders (the region becomes contested).
    // Ownership does NOT change and no Citizen penalty applies yet — that
    // happens only on an actual capture, once the dice-based Combat Phase
    // (sections 9-14, deferred) resolves the fight. For now both armies just
    // sit in the region; the region detail panel shows the pending battle.
    if (defenders.length > 0) {
      const events: readonly GameEngineEvent[] = [
        { type: 'RegionContested', playerId: this.playerId, regionId: this.targetRegionId },
        {
          type: 'UnitMoved',
          unitInstanceId: this.unitInstanceId,
          fromRegionId: unit.regionId,
          toRegionId: this.targetRegionId,
        },
      ];
      return { state: { ...state, units: state.units.map(movedAttacker) }, events };
    }

    // UNDEFENDED but this unit can't take ground on its own (Helicopter,
    // PROJECT_RULES.md section 22).
    if (unitDef.canCapture === false) {
      return reject(`${unitDef.name} units cannot capture a region on their own`);
    }

    // UNDEFENDED capture: flip ownership, move the unit in, and apply the
    // by-force Citizen Satisfaction penalties (PROJECT_RULES.md section 5).
    const previousOwnerId = targetRegion.ownerId;
    const nextRegions = {
      ...state.regions,
      [this.targetRegionId]: { ...targetRegion, ownerId: this.playerId },
    };
    const nextUnits = state.units.map(movedAttacker);

    const nextPlayers = applyForceCaptureSatisfactionPenalty(
      state.players,
      this.playerId,
      previousOwnerId,
      this.economyConfig,
    );

    const events: readonly GameEngineEvent[] = [
      { type: 'RegionCaptured', playerId: this.playerId, regionId: this.targetRegionId, previousOwnerId },
      {
        type: 'UnitMoved',
        unitInstanceId: this.unitInstanceId,
        fromRegionId: unit.regionId,
        toRegionId: this.targetRegionId,
      },
    ];
    return { state: { ...state, regions: nextRegions, units: nextUnits, players: nextPlayers }, events };
  }
}
