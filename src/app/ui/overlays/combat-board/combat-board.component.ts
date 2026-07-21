import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { GameStore } from '../../../state/store';
import { UnitInstance } from '../../../models/unit-instance.model';
import { CombatCasualty, CombatDieRoll, CombatStep } from '../../../models/region-combat.model';
import { UnitIconComponent } from '../../shared/unit-icon/unit-icon.component';

const COMBAT_COLUMNS: readonly number[] = [1, 2, 3, 4, 5];

interface CombatUnit {
  readonly instanceId: string;
  readonly unitId: string;
  readonly unitName: string;
  readonly color: string;
}

/**
 * The Attack Phase "battle mat" (PROJECT_RULES.md sections 9-15): units are
 * grouped by their Attack/Defense value into columns 1-5, one d6 per unit
 * rolled a round at a time via the Roll button, and the losing side clicks
 * which of their own units to remove as each round's casualties. Combat is
 * a simultaneous exchange (section 10): both sides roll before either
 * side's casualties are removed, so a unit due to die this round still
 * shows its own roll first. Always fights to a wipeout — no retreat (future
 * work, see engine/commands/roll-combat.command.ts). If the attacker
 * declared a missile strike (a Rocket System present, section 15), the
 * battle opens with a missile choice before any of that.
 */
@Component({
  selector: 'wwiii-combat-board',
  standalone: true,
  imports: [UnitIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './combat-board.component.html',
  styleUrl: './combat-board.component.scss',
})
export class CombatBoardComponent {
  protected readonly store = inject(GameStore);
  protected readonly columns = COMBAT_COLUMNS;

  protected readonly region = computed(() => {
    const id = this.store.combatRegionId();
    return id ? (this.store.regions()[id] ?? null) : null;
  });

  protected readonly attackerId = computed(() => this.store.activePlayer()?.id ?? null);
  protected readonly attackerName = computed(() => this.store.activePlayer()?.displayName ?? '');
  protected readonly defenderName = computed(() => {
    const defender = this.defenderUnits()[0];
    return defender ? (this.store.factions()[this.defenderOwnerId() ?? '']?.name ?? 'Defender') : 'Defender';
  });

  private readonly combat = this.store.activeCombat;
  protected readonly resolved = computed(() => this.store.combatOutcomeMessage() !== null);
  protected readonly step = computed<CombatStep>(() => this.combat()?.step ?? 'attackerRoll');
  protected readonly round = computed(() => this.combat()?.round ?? 1);
  protected readonly pendingDefenderCasualties = computed(() => this.combat()?.pendingDefenderCasualties ?? 0);
  protected readonly pendingAttackerCasualties = computed(() => this.combat()?.pendingAttackerCasualties ?? 0);
  protected readonly lastAttackerRolls = computed(() => this.combat()?.lastAttackerRolls ?? []);
  protected readonly lastDefenderRolls = computed(() => this.combat()?.lastDefenderRolls ?? []);

  protected readonly canRoll = computed(
    () => !this.resolved() && (this.step() === 'attackerRoll' || this.step() === 'defenderRoll'),
  );
  protected readonly rollLabel = computed(() =>
    this.step() === 'defenderRoll' ? 'Roll Defender Dice' : 'Roll Attacker Dice',
  );
  protected readonly attackerClickable = computed(() => !this.resolved() && this.step() === 'attackerCasualty');
  protected readonly defenderClickable = computed(
    () => !this.resolved() && (this.step() === 'defenderCasualty' || this.step() === 'missileCasualty'),
  );

  protected readonly pendingMissileChoice = computed(() => !this.resolved() && this.step() === 'missileChoice');
  protected readonly missileResult = computed(() => this.combat()?.missileResult ?? null);

  /** The active player's Reserve missiles available to fire, for the "Fire Missile" buttons. */
  protected readonly reserveMissiles = computed<readonly { unitId: string; name: string; quantity: number }[]>(() => {
    const player = this.store.activePlayer();
    if (!player) {
      return [];
    }
    const catalog = this.store.units();
    return player.reserve
      .filter((entry) => entry.quantity > 0 && catalog[entry.unitId]?.category === 'missile')
      .map((entry) => ({ unitId: entry.unitId, name: catalog[entry.unitId]?.name ?? entry.unitId, quantity: entry.quantity }));
  });

  private readonly regionUnits = computed<readonly UnitInstance[]>(() => {
    const id = this.store.combatRegionId();
    return id ? (this.store.unitsByRegion()[id] ?? []) : [];
  });

  private readonly defenderOwnerId = computed(() => {
    const attackerId = this.attackerId();
    return this.regionUnits().find((unit) => unit.ownerId !== attackerId)?.ownerId ?? null;
  });

  protected readonly attackerUnits = computed<readonly CombatUnit[]>(() => {
    const attackerId = this.attackerId();
    return this.regionUnits()
      .filter((unit) => unit.ownerId === attackerId)
      .map((unit) => this.toCombatUnit(unit));
  });

  protected readonly defenderUnits = computed<readonly CombatUnit[]>(() => {
    const attackerId = this.attackerId();
    return this.regionUnits()
      .filter((unit) => unit.ownerId !== attackerId)
      .map((unit) => this.toCombatUnit(unit));
  });

  protected readonly attackerNonCombatants = computed(() =>
    this.attackerUnits().filter((unit) => this.attackValue(unit.unitId) <= 0),
  );
  protected readonly defenderNonCombatants = computed(() =>
    this.defenderUnits().filter((unit) => this.defenseValue(unit.unitId) <= 0),
  );

  protected attackerColumn(value: number): readonly CombatUnit[] {
    return this.attackerUnits().filter((unit) => this.attackValue(unit.unitId) === value);
  }

  protected defenderColumn(value: number): readonly CombatUnit[] {
    return this.defenderUnits().filter((unit) => this.defenseValue(unit.unitId) === value);
  }

  /** Casualties stay visible in their column's casualty slot for the rest of the battle instead of just vanishing. */
  protected readonly attackerCasualties = computed<readonly CombatUnit[]>(() => {
    const attackerId = this.attackerId();
    return (this.combat()?.attackerCasualties ?? []).map((casualty) =>
      this.toCombatUnitFromCasualty(casualty, attackerId),
    );
  });

  protected readonly defenderCasualties = computed<readonly CombatUnit[]>(() => {
    const defenderId = this.defenderOwnerId();
    return (this.combat()?.defenderCasualties ?? []).map((casualty) =>
      this.toCombatUnitFromCasualty(casualty, defenderId),
    );
  });

  protected attackerCasualtyColumn(value: number): readonly CombatUnit[] {
    return this.attackerCasualties().filter((unit) => this.attackValue(unit.unitId) === value);
  }

  protected defenderCasualtyColumn(value: number): readonly CombatUnit[] {
    return this.defenderCasualties().filter((unit) => this.defenseValue(unit.unitId) === value);
  }

  /** The die a specific unit rolled this round, so its result can be shown right on its own icon instead of an unlabeled list. */
  protected attackerRollFor(instanceId: string): CombatDieRoll | null {
    return this.lastAttackerRolls().find((entry) => entry.instanceId === instanceId) ?? null;
  }

  protected defenderRollFor(instanceId: string): CombatDieRoll | null {
    return this.lastDefenderRolls().find((entry) => entry.instanceId === instanceId) ?? null;
  }

  protected roll(): void {
    const playerId = this.attackerId();
    const regionId = this.store.combatRegionId();
    if (playerId && regionId) {
      this.store.rollCombat(playerId, regionId);
    }
  }

  protected missileName(unitId: string): string {
    return this.store.units()[unitId]?.name ?? unitId;
  }

  protected fireMissile(missileUnitId: string): void {
    const playerId = this.attackerId();
    const regionId = this.store.combatRegionId();
    if (playerId && regionId) {
      this.store.fireMissile(playerId, regionId, missileUnitId);
    }
  }

  protected removeCasualty(unit: CombatUnit): void {
    const playerId = this.attackerId();
    const regionId = this.store.combatRegionId();
    if (playerId && regionId) {
      this.store.removeCasualty(playerId, regionId, unit.instanceId);
    }
  }

  protected close(): void {
    this.store.closeCombat();
  }

  private attackValue(unitId: string): number {
    return this.store.units()[unitId]?.attack ?? 0;
  }

  private defenseValue(unitId: string): number {
    return this.store.units()[unitId]?.defense ?? 0;
  }

  private toCombatUnit(unit: UnitInstance): CombatUnit {
    return {
      instanceId: unit.id,
      unitId: unit.unitId,
      unitName: this.store.units()[unit.unitId]?.name ?? unit.unitId,
      color: this.store.factions()[unit.ownerId]?.color ?? '#888888',
    };
  }

  private toCombatUnitFromCasualty(casualty: CombatCasualty, ownerId: string | null): CombatUnit {
    return {
      instanceId: casualty.instanceId,
      unitId: casualty.unitId,
      unitName: this.store.units()[casualty.unitId]?.name ?? casualty.unitId,
      color: this.store.factions()[ownerId ?? '']?.color ?? '#888888',
    };
  }
}
