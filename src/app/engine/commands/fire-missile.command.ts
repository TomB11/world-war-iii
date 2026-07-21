import { Command, CommandResult } from '../../interfaces/command';
import { GameState } from '../../models/game-state.model';
import { GameEngineEvent } from '../../interfaces/game-events';
import { UnitDefinition } from '../../models/unit.model';
import { MissileOutcome, MissileResult, RegionCombat } from '../../models/region-combat.model';
import { RulesEngine } from '../rules-engine';
import { rollDie } from '../random';

const DICE_SIDES = 6;
const INTERCEPT_THRESHOLD = 2;

/**
 * Fires one missile from Reserve at a region where the attacker declared a
 * strike by moving a Rocket System in (PROJECT_RULES.md section 15).
 * Missiles resolve before any other combat in the Attack Phase — this is
 * always the first thing that can happen in a fresh battle that has one
 * pending (see RulesEngine.hasPendingMissileStrike).
 *
 * Resolved in one shot: if the defender has their own Rocket System in the
 * target region or an adjacent one, the active player rolls an interception
 * die for them first (<= 2 destroys the missile, same hot-seat convention
 * used for every other "roll for the other side" step this game). If the
 * missile survives, the attacker rolls against the missile's own attack
 * value (Missile A hits on <= 2, Missile B on <= 4, both data-driven from
 * units.json, never hardcoded). A hit leaves exactly one casualty pending
 * for the defender to choose (RemoveCasualtyCommand, step 'missileCasualty');
 * a miss or interception moves straight into normal combat.
 */
export class FireMissileCommand implements Command {
  readonly type = 'FireMissile';

  constructor(
    private readonly playerId: string,
    private readonly regionId: string,
    private readonly missileUnitId: string,
    private readonly unitCatalog: Readonly<Record<string, UnitDefinition>>,
    private readonly rules: RulesEngine = new RulesEngine(),
  ) {}

  execute(state: GameState): CommandResult {
    const reject = (reason: string): CommandResult => ({
      state,
      events: [{ type: 'CombatRejected', playerId: this.playerId, reason }],
    });

    if (state.phase !== 'attack') {
      return reject('Missiles can only be fired during the Attack Phase');
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
    if (combat.step !== 'missileChoice') {
      return reject('No missile strike is pending in this region');
    }

    const missileDef = this.unitCatalog[this.missileUnitId];
    if (!missileDef || missileDef.category !== 'missile') {
      return reject(`Unknown missile type "${this.missileUnitId}"`);
    }

    const player = this.rules.getPlayer(state, this.playerId);
    const reserveEntry = player?.reserve.find((entry) => entry.unitId === this.missileUnitId);
    if (!player || !reserveEntry || reserveEntry.quantity <= 0) {
      return reject(`You have no "${missileDef.name}" in Reserve`);
    }

    const nextPlayers = state.players.map((candidate) =>
      candidate.id === this.playerId
        ? {
            ...candidate,
            reserve: candidate.reserve
              .map((entry) =>
                entry.unitId === this.missileUnitId ? { ...entry, quantity: entry.quantity - 1 } : entry,
              )
              .filter((entry) => entry.quantity > 0),
          }
        : candidate,
    );

    // Interception: only possible if the defender has their own missile
    // launcher in the target region or a neighboring one.
    const targetRegion = state.regions[this.regionId];
    const neighborIds = new Set(targetRegion?.neighbors ?? []);
    const interceptorPresent = state.units.some(
      (unit) =>
        unit.ownerId !== this.playerId &&
        (unit.regionId === this.regionId || neighborIds.has(unit.regionId)) &&
        this.unitCatalog[unit.unitId]?.canDeclareMissile,
    );

    let seed = state.randomSeed;
    let interceptRoll: number | null = null;
    let attackRoll: number | null = null;
    let outcome: MissileOutcome = 'miss';

    if (interceptorPresent) {
      const roll = rollDie(seed, DICE_SIDES);
      seed = roll.nextSeed;
      interceptRoll = roll.result;
      if (roll.result <= INTERCEPT_THRESHOLD) {
        outcome = 'intercepted';
      }
    }

    if (outcome !== 'intercepted') {
      const roll = rollDie(seed, DICE_SIDES);
      seed = roll.nextSeed;
      attackRoll = roll.result;
      outcome = roll.result <= missileDef.attack ? 'hit' : 'miss';
    }

    const missileResult: MissileResult = { missileId: this.missileUnitId, interceptRoll, attackRoll, outcome };
    const nextCombat: RegionCombat = {
      ...combat,
      step: outcome === 'hit' ? 'missileCasualty' : 'attackerRoll',
      pendingDefenderCasualties: outcome === 'hit' ? 1 : 0,
      missileResult,
    };

    const events: readonly GameEngineEvent[] = [{ type: 'CombatRoundRolled', regionId: this.regionId }];
    return {
      state: {
        ...state,
        randomSeed: seed,
        players: nextPlayers,
        combats: { ...state.combats, [this.regionId]: nextCombat },
      },
      events,
    };
  }
}
