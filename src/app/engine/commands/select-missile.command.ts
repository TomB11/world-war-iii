import { Command, CommandResult } from '../../interfaces/command';
import { GameState } from '../../models/game-state.model';
import { GameEngineEvent } from '../../interfaces/game-events';
import { UnitDefinition } from '../../models/unit.model';
import { RegionCombat } from '../../models/region-combat.model';
import { RulesEngine } from '../rules-engine';

/**
 * Arms one missile from Reserve for a pending strike (PROJECT_RULES.md
 * section 15) — the first of two clicks, mirroring the normal
 * attacker/defender roll flow: this only picks which missile, moving the
 * battle from 'missileChoice' to 'missileRoll' so the combat board can show
 * it sitting in its hit-threshold column (Missile A under 2, Missile B under
 * 4 — its own Attack value, same convention as every other unit's column).
 * The player then rolls it themselves via FireMissileCommand, which is what
 * actually resolves interception/hit and removes it from Reserve.
 */
export class SelectMissileCommand implements Command {
  readonly type = 'SelectMissile';

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
      return reject('Missiles can only be selected during the Attack Phase');
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

    const nextCombat: RegionCombat = { ...combat, step: 'missileRoll', armedMissileUnitId: this.missileUnitId };
    const events: readonly GameEngineEvent[] = [{ type: 'CombatRoundRolled', regionId: this.regionId }];
    return {
      state: { ...state, combats: { ...state.combats, [this.regionId]: nextCombat } },
      events,
    };
  }
}
