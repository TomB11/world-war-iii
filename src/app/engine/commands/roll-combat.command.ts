import { Command, CommandResult } from '../../interfaces/command';
import { GameState } from '../../models/game-state.model';
import { GameEngineEvent } from '../../interfaces/game-events';
import { UnitDefinition } from '../../models/unit.model';
import { CombatDieRoll, RegionCombat } from '../../models/region-combat.model';
import { RulesEngine } from '../rules-engine';
import { rollDie } from '../random';

const DICE_SIDES = 6;

/**
 * Rolls one round's dice for whichever side is up next in a region's Attack
 * Phase battle (PROJECT_RULES.md sections 9-11): one d6 per living unit on
 * that side, hit if the roll is <= the unit's attack value (attacking) or
 * defense value (defending). Units with a 0 value in that role (e.g. a
 * Rocket System attacking, or a Missile defending) never roll. Hits are
 * capped at the opposing side's unit count — excess hits are wasted, same
 * as a real dice battle can't kill more units than exist.
 *
 * Combat is a simultaneous exchange (PROJECT_RULES.md section 10): the
 * attacker rolls first, then the defender rolls too — using its full,
 * not-yet-reduced roster, so a unit the attacker just hit still gets its
 * own roll before anyone is actually removed. Casualties for both sides are
 * only assigned (RemoveCasualtyCommand) after both rolls are in.
 */
export class RollCombatCommand implements Command {
  readonly type = 'RollCombat';

  constructor(
    private readonly playerId: string,
    private readonly regionId: string,
    private readonly unitCatalog: Readonly<Record<string, UnitDefinition>>,
    private readonly rules: RulesEngine = new RulesEngine(),
  ) {}

  execute(state: GameState): CommandResult {
    const reject = (reason: string): CommandResult => ({
      state,
      events: [{ type: 'CombatRejected', playerId: this.playerId, reason }],
    });

    if (state.phase !== 'attack') {
      return reject('Combat can only be rolled during the Attack Phase');
    }
    if (state.activePlayerId !== this.playerId) {
      return reject('It is not your turn');
    }

    const regionUnits = state.units.filter((unit) => unit.regionId === this.regionId);
    const attackers = regionUnits.filter((unit) => unit.ownerId === this.playerId);
    const defenders = regionUnits.filter((unit) => unit.ownerId !== this.playerId);
    if (attackers.length === 0 || defenders.length === 0) {
      return reject('This region has no pending battle');
    }

    const combat: RegionCombat =
      state.combats[this.regionId] ??
      this.rules.createInitialCombat(state, this.regionId, this.playerId, this.unitCatalog);

    if (combat.step !== 'attackerRoll' && combat.step !== 'defenderRoll') {
      return reject('Resolve the current step before rolling again');
    }

    const isAttackerRoll = combat.step === 'attackerRoll';
    const rollingSide = isAttackerRoll ? attackers : defenders;
    const opposingCount = isAttackerRoll ? defenders.length : attackers.length;

    let seed = state.randomSeed;
    const rolls: CombatDieRoll[] = [];
    let hits = 0;
    for (const unit of rollingSide) {
      const value = isAttackerRoll ? this.unitCatalog[unit.unitId]?.attack : this.unitCatalog[unit.unitId]?.defense;
      if (!value || value <= 0) {
        continue;
      }
      const roll = rollDie(seed, DICE_SIDES);
      seed = roll.nextSeed;
      const hit = roll.result <= value;
      rolls.push({ instanceId: unit.id, unitId: unit.unitId, roll: roll.result, hit });
      if (hit) {
        hits += 1;
      }
    }

    const pendingCasualties = Math.min(hits, opposingCount);

    let nextStep: RegionCombat['step'];
    let nextRound = combat.round;
    let pendingDefenderCasualties = combat.pendingDefenderCasualties;
    let pendingAttackerCasualties = combat.pendingAttackerCasualties;

    if (isAttackerRoll) {
      pendingDefenderCasualties = pendingCasualties;
      nextStep = 'defenderRoll';
    } else {
      pendingAttackerCasualties = pendingCasualties;
      // Both rolls are in — assign the defender's casualties first, then the attacker's.
      if (pendingDefenderCasualties > 0) {
        nextStep = 'defenderCasualty';
      } else if (pendingAttackerCasualties > 0) {
        nextStep = 'attackerCasualty';
      } else {
        nextStep = 'attackerRoll';
        nextRound = combat.round + 1;
      }
    }

    const nextCombat: RegionCombat = {
      regionId: this.regionId,
      round: nextRound,
      step: nextStep,
      pendingDefenderCasualties,
      pendingAttackerCasualties,
      // Clearing the other side's stale roll from last round when a fresh
      // attacker roll starts a new round — otherwise it would keep showing
      // last round's numbers as if the defender had already rolled again.
      lastAttackerRolls: isAttackerRoll ? rolls : combat.lastAttackerRolls,
      lastDefenderRolls: isAttackerRoll ? [] : rolls,
      attackerCasualties: combat.attackerCasualties,
      defenderCasualties: combat.defenderCasualties,
      missileResult: combat.missileResult,
    };

    const events: readonly GameEngineEvent[] = [{ type: 'CombatRoundRolled', regionId: this.regionId }];
    return {
      state: {
        ...state,
        randomSeed: seed,
        combats: { ...state.combats, [this.regionId]: nextCombat },
      },
      events,
    };
  }
}
