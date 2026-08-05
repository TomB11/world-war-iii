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

  /** Whether the panel has anything to show this phase (deploy, or a transport to unload). */
  protected readonly hasContent = computed(
    () => this.isDeployPhase() || this.loadedTransports().length > 0,
  );

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
