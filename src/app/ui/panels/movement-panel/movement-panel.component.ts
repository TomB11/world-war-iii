import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { GameCoreStore } from '../../../state/core/game-core.store';
import { MapUiStore } from '../../../state/map/map-ui.store';
import { MovementStore } from '../../../state/movement/movement.store';
import { UnitInstance } from '../../../models/unit-instance.model';
import { UnitIconComponent } from '../../shared/unit-icon/unit-icon.component';

/**
 * Utility panel for the two things drag-and-drop on the map can't do:
 * deploying reserve units (Place New Units phase) and unloading cargo from
 * transports (movement phases). All ordinary movement, attacking and loading
 * happen by dragging units on the map, so there is no move/attack list here.
 *
 * Both deploy and unload are "arm, then click a highlighted region on the
 * map" flows (GameStore.armDeployUnit/armUnloadUnit + pendingAction) rather
 * than a region selector — clicking a Reserve unit or an "Unload" button
 * arms the action, and WorldMapComponent highlights every legal destination
 * and resolves the next canvas click against it.
 */
@Component({
  selector: 'wwiii-movement-panel',
  standalone: true,
  imports: [UnitIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './movement-panel.component.html',
  styleUrl: './movement-panel.component.scss',
})
export class MovementPanelComponent {
  protected readonly gameCoreStore = inject(GameCoreStore);
  protected readonly mapUiStore = inject(MapUiStore);
  protected readonly movementStore = inject(MovementStore);

  protected readonly isDeployPhase = computed(() => this.gameCoreStore.state()?.phase === 'placeNewUnits');

  /** The active player's transports (in a sea zone) that currently carry cargo, for the Unload list. */
  protected readonly loadedTransports = computed<readonly UnitInstance[]>(() => {
    const units = this.gameCoreStore.activePlayerUnits();
    const catalog = this.gameCoreStore.units();
    return units.filter(
      (unit) =>
        (catalog[unit.unitId]?.transportCapacity ?? 0) > 0 &&
        units.some((u) => u.transportedBy === unit.id),
    );
  });

  /**
   * The active player's missiles in Reserve (PROJECT_RULES.md sections 15/16),
   * shown while planning/resolving attacks so the player knows what a Rocket
   * System can fire and how far. Range and hit threshold come from units.json.
   */
  protected readonly missileArsenal = computed<
    readonly { unitId: string; name: string; quantity: number; range: number; hitOn: number }[]
  >(() => {
    const phase = this.gameCoreStore.state()?.phase;
    if (phase !== 'attackMoves' && phase !== 'attack') {
      return [];
    }
    const catalog = this.gameCoreStore.units();
    const rows: { unitId: string; name: string; quantity: number; range: number; hitOn: number }[] = [];
    for (const entry of this.gameCoreStore.activePlayer()?.reserve ?? []) {
      const def = catalog[entry.unitId];
      if (def?.category === 'missile' && entry.quantity > 0) {
        rows.push({
          unitId: entry.unitId,
          name: def.name,
          quantity: entry.quantity,
          range: def.missileRange ?? 1,
          hitOn: def.attack,
        });
      }
    }
    return rows;
  });

  /** Whether the panel has anything to show this phase (deploy, a transport to unload, an attack to cancel, or missiles in Reserve). */
  protected readonly hasContent = computed(
    () =>
      this.isDeployPhase() ||
      this.loadedTransports().length > 0 ||
      this.declaredAttacks().length > 0 ||
      this.missileArsenal().length > 0,
  );

  /**
   * This turn's Attack Moves attacks, one row per unit (its latest attack),
   * each with whether it can still be cancelled — only offered during the
   * Attack Moves phase itself, before the phase is advanced.
   */
  protected readonly declaredAttacks = computed<
    readonly { unitInstanceId: string; unitId: string; label: string; canCancel: boolean; reason: string | null }[]
  >(() => {
    const state = this.gameCoreStore.state();
    if (!state || state.phase !== 'attackMoves') {
      return [];
    }
    const seen = new Set<string>();
    const rows: { unitInstanceId: string; unitId: string; label: string; canCancel: boolean; reason: string | null }[] = [];
    for (const record of [...state.attackRecords].reverse()) {
      if (seen.has(record.unitInstanceId)) {
        continue;
      }
      seen.add(record.unitInstanceId);
      const unit = state.units.find((candidate) => candidate.id === record.unitInstanceId);
      if (!unit || unit.ownerId !== state.activePlayerId) {
        continue;
      }
      const check = this.movementStore.cancelAttackCheck(record.unitInstanceId);
      const target = this.regionName(record.toRegionId);
      rows.push({
        unitInstanceId: record.unitInstanceId,
        unitId: unit.unitId,
        label:
          record.kind === 'missile'
            ? `${this.unitName(unit.unitId)}: missile strike on ${target}`
            : `${this.unitName(unit.unitId)}: ${this.regionName(record.fromRegionId)} → ${target}`,
        canCancel: check.allowed,
        reason: check.reason,
      });
    }
    return rows.reverse();
  });

  protected cancelAttack(unitInstanceId: string): void {
    const playerId = this.gameCoreStore.state()?.activePlayerId;
    if (playerId) {
      this.movementStore.cancelAttack(playerId, unitInstanceId);
    }
  }

  /**
   * Reserve entries deployable this phase — excludes missiles (PROJECT_RULES.md
   * section 15): a missile is never placed on the map, it's fired directly
   * from Reserve by a Rocket System's declared strike (see FireMissileCommand),
   * so it has no business in this list at all.
   */
  protected readonly reserveEntries = computed(() => {
    const catalog = this.gameCoreStore.units();
    return (this.gameCoreStore.activePlayer()?.reserve ?? []).filter(
      (entry) => catalog[entry.unitId]?.category !== 'missile',
    );
  });

  protected readonly activePlayerFactionId = computed(() => this.gameCoreStore.activePlayer()?.factionId ?? null);

  protected readonly activePlayerColor = computed(() => {
    const player = this.gameCoreStore.activePlayer();
    if (!player) {
      return '#888888';
    }
    return this.gameCoreStore.factions()[player.factionId]?.color ?? '#888888';
  });

  /** Hint shown while a deploy/unload is armed — what to do next, or why nothing is highlighted. */
  protected readonly pendingActionHint = computed<string | null>(() => {
    const pending = this.mapUiStore.pendingAction();
    if (!pending) {
      return null;
    }
    if (pending.kind !== 'deploy' && pending.kind !== 'unload') {
      return null;
    }
    if (pending.kind === 'deploy') {
      return pending.destinations.length > 0
        ? `Click a highlighted region on the map to deploy ${this.unitName(pending.subjectId)}.`
        : `No eligible factory region to deploy ${this.unitName(pending.subjectId)} right now.`;
    }
    return pending.destinations.length > 0
      ? 'Click a highlighted region on the map to unload.'
      : 'No adjacent coast to unload onto right now.';
  });

  protected isArmedForDeploy(unitId: string): boolean {
    const pending = this.mapUiStore.pendingAction();
    return pending !== null && pending.kind === 'deploy' && pending.subjectId === unitId;
  }

  protected isArmedForUnload(unitInstanceId: string): boolean {
    const pending = this.mapUiStore.pendingAction();
    return pending !== null && pending.kind === 'unload' && pending.subjectId === unitInstanceId;
  }

  protected armDeploy(unitId: string): void {
    this.movementStore.armDeployUnit(unitId);
  }

  protected armUnload(unitInstanceId: string): void {
    this.movementStore.armUnloadUnit(unitInstanceId);
  }

  protected cancelPendingAction(): void {
    this.mapUiStore.clearPendingAction();
  }

  protected unitName(unitId: string): string {
    return this.gameCoreStore.units()[unitId]?.name ?? unitId;
  }

  protected regionName(regionId: string): string {
    const region = this.gameCoreStore.regions()[regionId];
    if (region) {
      return region.name;
    }
    const seaZone = this.gameCoreStore.seaZones()[regionId];
    if (seaZone) {
      return `Sea Zone ${seaZone.label}`;
    }
    return regionId;
  }

  protected embarkedUnits(transportInstanceId: string): readonly UnitInstance[] {
    return this.gameCoreStore.activePlayerUnits().filter((unit) => unit.transportedBy === transportInstanceId);
  }

  protected unloadDestinations(unitInstanceId: string): readonly string[] {
    return this.movementStore.unloadDestinations(unitInstanceId);
  }
}
