import { Command, CommandResult } from '../../interfaces/command';
import { GameState } from '../../models/game-state.model';
import { GameEngineEvent } from '../../interfaces/game-events';
import { EconomyConfig } from '../../models/economy-config.model';
import { CombatCasualty, CombatStep, RegionCombat } from '../../models/region-combat.model';
import { RulesEngine } from '../rules-engine';
import { applyForceCaptureSatisfactionPenalty } from './shared/capture-penalties';

/**
 * Removes one unit as a casualty during a region's Attack Phase battle
 * (PROJECT_RULES.md sections 10/13-15, retreat excluded — combat always
 * fights to a wipeout). The player picks which of the losing side's units
 * dies. Handles three cases the same way (always removing one of the
 * defender's units, one at a time, until the pending count hits zero):
 * a missile hit ('missileCasualty', always exactly one), a normal round's
 * defender losses ('defenderCasualty'), and a normal round's attacker
 * losses ('attackerCasualty', removing the ACTIVE player's own unit
 * instead). Combat is a simultaneous exchange: by the time either normal
 * casualty step is reached, BOTH sides have already rolled for this round,
 * so a unit removed here already got its own roll in before dying. Once a
 * missile casualty or the defender's round casualties are all assigned, the
 * attacker's (already known from the same round's rolls, if any) are
 * assigned next; only once both are cleared does the round check for a
 * winner — if the defenders are now gone the region is captured by force
 * (same ownership-flip + Citizen Satisfaction penalty as an undefended
 * AttackCommand capture); if the attackers are gone instead (or both sides
 * are, a mutual wipeout), the attack fails and ownership is unchanged;
 * otherwise combat continues into the next round.
 */
export class RemoveCasualtyCommand implements Command {
  readonly type = 'RemoveCasualty';

  constructor(
    private readonly playerId: string,
    private readonly regionId: string,
    private readonly unitInstanceId: string,
    private readonly economyConfig: EconomyConfig,
    private readonly rules: RulesEngine = new RulesEngine(),
  ) {}

  execute(state: GameState): CommandResult {
    const reject = (reason: string): CommandResult => ({
      state,
      events: [{ type: 'CombatRejected', playerId: this.playerId, reason }],
    });

    if (state.phase !== 'attack') {
      return reject('Combat can only be resolved during the Attack Phase');
    }
    if (state.activePlayerId !== this.playerId) {
      return reject('It is not your turn');
    }

    const combat = state.combats[this.regionId];
    const casualtySteps: readonly CombatStep[] = ['missileCasualty', 'defenderCasualty', 'attackerCasualty'];
    if (!combat || !casualtySteps.includes(combat.step)) {
      return reject('No casualties are pending in this region');
    }
    const removesDefenderUnit = combat.step === 'missileCasualty' || combat.step === 'defenderCasualty';
    const pendingCount = removesDefenderUnit ? combat.pendingDefenderCasualties : combat.pendingAttackerCasualties;
    if (pendingCount <= 0) {
      return reject('No casualties are pending in this region');
    }

    const unit = this.rules.getUnitInstance(state, this.unitInstanceId);
    if (!unit || unit.regionId !== this.regionId) {
      return reject(`Unknown unit "${this.unitInstanceId}" in this region`);
    }
    const belongsToLosingSide = removesDefenderUnit
      ? unit.ownerId !== this.playerId
      : unit.ownerId === this.playerId;
    if (!belongsToLosingSide) {
      return reject('That unit is not part of the side taking losses');
    }

    const nextUnits = state.units.filter((candidate) => candidate.id !== this.unitInstanceId);
    const remaining = pendingCount - 1;

    // Keep the casualty around (instead of just vanishing) so the combat
    // board can still show it in its column's casualty slot for the rest of
    // this battle.
    const casualty: CombatCasualty = { instanceId: unit.id, unitId: unit.unitId };
    const attackerCasualties = removesDefenderUnit ? combat.attackerCasualties : [...combat.attackerCasualties, casualty];
    const defenderCasualties = removesDefenderUnit ? [...combat.defenderCasualties, casualty] : combat.defenderCasualties;

    const casualtyEvent: GameEngineEvent = {
      type: 'CasualtyRemoved',
      regionId: this.regionId,
      unitInstanceId: this.unitInstanceId,
    };

    if (remaining > 0) {
      const nextCombat: RegionCombat = {
        ...combat,
        pendingDefenderCasualties: removesDefenderUnit ? remaining : combat.pendingDefenderCasualties,
        pendingAttackerCasualties: removesDefenderUnit ? combat.pendingAttackerCasualties : remaining,
        attackerCasualties,
        defenderCasualties,
      };
      return {
        state: { ...state, units: nextUnits, combats: { ...state.combats, [this.regionId]: nextCombat } },
        events: [casualtyEvent],
      };
    }

    // A missile casualty is always exactly one and never touches the normal
    // round counters — move straight into round 1 of normal combat.
    if (combat.step === 'missileCasualty') {
      return this.checkWinnerOrContinue(
        state,
        nextUnits,
        combat,
        attackerCasualties,
        defenderCasualties,
        casualtyEvent,
        { step: 'attackerRoll', round: combat.round },
      );
    }

    // This side's normal-round casualties are all assigned. If the defender
    // just finished and the attacker still has casualties owed from the
    // same round's rolls, move on to those next; otherwise the round's
    // casualties are fully resolved and it's time to check for a winner.
    if (combat.step === 'defenderCasualty' && combat.pendingAttackerCasualties > 0) {
      const nextCombat: RegionCombat = {
        ...combat,
        pendingDefenderCasualties: 0,
        step: 'attackerCasualty',
        attackerCasualties,
        defenderCasualties,
      };
      return {
        state: { ...state, units: nextUnits, combats: { ...state.combats, [this.regionId]: nextCombat } },
        events: [casualtyEvent],
      };
    }

    return this.checkWinnerOrContinue(state, nextUnits, combat, attackerCasualties, defenderCasualties, casualtyEvent, {
      step: 'attackerRoll',
      round: combat.round + 1,
    });
  }

  private checkWinnerOrContinue(
    state: GameState,
    nextUnits: GameState['units'],
    combat: RegionCombat,
    attackerCasualties: readonly CombatCasualty[],
    defenderCasualties: readonly CombatCasualty[],
    casualtyEvent: GameEngineEvent,
    continuation: { step: CombatStep; round: number },
  ): CommandResult {
    const regionUnits = nextUnits.filter((candidate) => candidate.regionId === this.regionId);
    const defendersRemain = regionUnits.some((candidate) => candidate.ownerId !== this.playerId);
    const attackersRemain = regionUnits.some((candidate) => candidate.ownerId === this.playerId);

    // The attacker only takes the region by wiping the defenders while
    // surviving themselves — a mutual wipeout (both sides hit zero in the
    // same round) is a draw, and ownership stays with the defender exactly
    // like a simple repel.
    if (!defendersRemain && attackersRemain) {
      return this.resolveCapture(state, nextUnits, casualtyEvent);
    }
    if (!attackersRemain) {
      const { [this.regionId]: _removed, ...remainingCombats } = state.combats;
      return {
        state: { ...state, units: nextUnits, combats: remainingCombats },
        events: [
          casualtyEvent,
          { type: 'RegionCombatResolved', regionId: this.regionId, attackerId: this.playerId, captured: false },
        ],
      };
    }

    const nextCombat: RegionCombat = {
      ...combat,
      pendingDefenderCasualties: 0,
      pendingAttackerCasualties: 0,
      step: continuation.step,
      round: continuation.round,
      attackerCasualties,
      defenderCasualties,
    };
    return {
      state: { ...state, units: nextUnits, combats: { ...state.combats, [this.regionId]: nextCombat } },
      events: [casualtyEvent],
    };
  }

  /** Defenders wiped out — the region flips to the attacker, same by-force penalties as an undefended AttackCommand capture. */
  private resolveCapture(
    state: GameState,
    nextUnits: GameState['units'],
    casualtyEvent: GameEngineEvent,
  ): CommandResult {
    const targetRegion = state.regions[this.regionId];
    const previousOwnerId = targetRegion?.ownerId ?? null;
    const nextRegions = targetRegion
      ? { ...state.regions, [this.regionId]: { ...targetRegion, ownerId: this.playerId } }
      : state.regions;

    const nextPlayers = applyForceCaptureSatisfactionPenalty(
      state.players,
      this.playerId,
      previousOwnerId,
      this.economyConfig,
    );

    const { [this.regionId]: _removed, ...remainingCombats } = state.combats;
    const events: readonly GameEngineEvent[] = [
      casualtyEvent,
      { type: 'RegionCaptured', playerId: this.playerId, regionId: this.regionId, previousOwnerId },
      { type: 'RegionCombatResolved', regionId: this.regionId, attackerId: this.playerId, captured: true },
    ];
    return {
      state: { ...state, regions: nextRegions, units: nextUnits, players: nextPlayers, combats: remainingCombats },
      events,
    };
  }
}
