import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { GameStore } from '../../../state/store';
import { UnitInstance } from '../../../models/unit-instance.model';
import { CombatCasualty, CombatDieRoll, CombatStep } from '../../../models/region-combat.model';
import { CombatUnitSlotComponent } from './combat-unit-slot/combat-unit-slot.component';
import { COMBAT_COLUMNS } from './combat-board.constants';

interface CombatUnit {
  readonly instanceId: string;
  readonly unitId: string;
  readonly unitName: string;
  readonly ownerId: string | null;
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
 * work, see engine/commands/roll-combat.command.ts). If the attacker's
 * Rocket System declared a supporting strike (section 15 — the launcher
 * itself stays wherever it was), the battle opens with a missile choice
 * before any of that.
 */
@Component({
  selector: 'wwiii-combat-board',
  standalone: true,
  imports: [CombatUnitSlotComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './combat-board.component.html',
  styleUrl: './combat-board.component.scss',
})
export class CombatBoardComponent {
  protected readonly store = inject(GameStore);
  protected readonly columns = COMBAT_COLUMNS;

  /** The battle's location name — a Region for a land fight, or a SeaZone's label for a naval one (combatRegionId is a sea zone id there). */
  protected readonly regionLabel = computed(() => {
    const id = this.store.combatRegionId();
    if (!id) {
      return '';
    }
    return this.store.regions()[id]?.name ?? this.store.seaZones()[id]?.label ?? '';
  });

  protected readonly attackerId = computed(() => this.store.activePlayer()?.id ?? null);
  protected readonly attackerName = computed(() => this.store.activePlayer()?.displayName ?? '');
  protected readonly defenderName = computed(() => {
    const defender = this.defenderUnits()[0];
    return defender ? (this.store.factions()[this.defenderOwnerId() ?? '']?.name ?? 'Defender') : 'Defender';
  });

  /** Faction colors driving the board's per-side accents (columns, badges, glow) — falls back to the generic theme colors if a side has no units yet. */
  protected readonly attackerColor = computed(
    () => this.store.factions()[this.attackerId() ?? '']?.color ?? '#4fb8e0',
  );
  protected readonly defenderColor = computed(
    () => this.store.factions()[this.defenderOwnerId() ?? '']?.color ?? '#b8433f',
  );

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

  /** Set once a missile is armed (SelectMissileCommand) until it's rolled (FireMissileCommand) — the player picked which missile but hasn't rolled the die yet. */
  protected readonly pendingMissileRoll = computed(() => !this.resolved() && this.step() === 'missileRoll');
  protected readonly armedMissileUnitId = computed(() => this.combat()?.armedMissileUnitId ?? null);
  protected readonly armedMissileName = computed(() => {
    const unitId = this.armedMissileUnitId();
    return unitId ? this.missileName(unitId) : '';
  });
  /** Which attacker column (its own Attack value — Missile A under 2, Missile B under 4) the armed missile sits in while awaiting its roll. */
  private readonly armedMissileColumnValue = computed(() => {
    const unitId = this.armedMissileUnitId();
    return unitId ? (this.store.units()[unitId]?.attack ?? null) : null;
  });

  /** The active player's Reserve missiles available to select, for the missile-choice buttons. */
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

  /** Units actually IN this battle — excludes embarked land/support cargo riding along on a transport in a naval fight (they never roll, see GameStore.isCombatParticipant). */
  private readonly regionUnits = computed<readonly UnitInstance[]>(() => {
    const id = this.store.combatRegionId();
    if (!id) {
      return [];
    }
    return (this.store.unitsByRegion()[id] ?? []).filter((unit) => this.store.isCombatParticipant(unit));
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

  /** The armed missile's unitId, only while it sits in this specific column awaiting its roll (see armedMissileColumnValue). */
  protected armedMissileFor(value: number): string | null {
    if (!this.pendingMissileRoll() || this.armedMissileColumnValue() !== value) {
      return null;
    }
    return this.armedMissileUnitId();
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

  protected selectMissile(missileUnitId: string): void {
    const playerId = this.attackerId();
    const regionId = this.store.combatRegionId();
    if (playerId && regionId) {
      this.store.selectMissile(playerId, regionId, missileUnitId);
    }
  }

  protected rollMissile(): void {
    const playerId = this.attackerId();
    const regionId = this.store.combatRegionId();
    if (playerId && regionId) {
      this.store.fireMissile(playerId, regionId);
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
      ownerId: unit.ownerId,
      color: this.store.factions()[unit.ownerId]?.color ?? '#888888',
    };
  }

  private toCombatUnitFromCasualty(casualty: CombatCasualty, ownerId: string | null): CombatUnit {
    return {
      instanceId: casualty.instanceId,
      unitId: casualty.unitId,
      unitName: this.store.units()[casualty.unitId]?.name ?? casualty.unitId,
      ownerId,
      color: this.store.factions()[ownerId ?? '']?.color ?? '#888888',
    };
  }
}
