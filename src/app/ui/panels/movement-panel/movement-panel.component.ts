import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { GameStore } from '../../../state/store';
import { UnitInstance } from '../../../models/unit-instance.model';
import { UnitIconComponent } from '../../shared/unit-icon/unit-icon.component';

/**
 * Utility panel for the two things drag-and-drop on the map can't do:
 * deploying reserve units (Place New Units phase) and unloading cargo from
 * transports (movement phases). All ordinary movement, attacking and loading
 * happen by dragging units on the map, so there is no move/attack list here.
 */
@Component({
  selector: 'wwiii-movement-panel',
  standalone: true,
  imports: [FormsModule, UnitIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './movement-panel.component.html',
  styleUrl: './movement-panel.component.scss',
})
export class MovementPanelComponent {
  protected readonly store = inject(GameStore);

  protected readonly selectedUnitId = signal<string>('');
  protected readonly selectedRegionId = signal<string>('');

  protected readonly isDeployPhase = computed(() => this.store.state()?.phase === 'placeNewUnits');

  /** The active player's transports (in a sea zone) that currently carry cargo, for the Unload list. */
  protected readonly loadedTransports = computed<readonly UnitInstance[]>(() => {
    const units = this.store.activePlayerUnits();
    const catalog = this.store.units();
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
    const catalog = this.store.units();
    return (this.store.activePlayer()?.reserve ?? []).filter(
      (entry) => catalog[entry.unitId]?.category !== 'missile',
    );
  });

  protected readonly activePlayerFactionId = computed(() => this.store.activePlayer()?.factionId ?? null);

  protected readonly activePlayerColor = computed(() => {
    const player = this.store.activePlayer();
    if (!player) {
      return '#888888';
    }
    return this.store.factions()[player.factionId]?.color ?? '#888888';
  });

  protected readonly deployableRegions = computed(() => {
    const player = this.store.activePlayer();
    if (!player) {
      return [];
    }
    return Object.values(this.store.regions()).filter(
      (region) => region.ownerId === player.id && region.factory > 0,
    );
  });

  /** Sea zones adjacent to at least one factory region the active player controls. */
  protected readonly deployableSeaZones = computed(() => {
    const player = this.store.activePlayer();
    if (!player) {
      return [];
    }
    const regions = this.store.regions();
    return Object.values(this.store.seaZones()).filter((zone) =>
      zone.adjacentRegionIds.some((id) => {
        const region = regions[id];
        return region !== undefined && region.ownerId === player.id && region.factory > 0;
      }),
    );
  });

  protected isSelectedUnitNaval(): boolean {
    return this.store.units()[this.selectedUnitId()]?.category === 'naval';
  }

  protected onSelectUnit(unitId: string): void {
    this.selectedUnitId.set(unitId);
    this.selectedRegionId.set('');
  }

  protected unitName(unitId: string): string {
    return this.store.units()[unitId]?.name ?? unitId;
  }

  protected regionName(regionId: string): string {
    const region = this.store.regions()[regionId];
    if (region) {
      return region.name;
    }
    const seaZone = this.store.seaZones()[regionId];
    if (seaZone) {
      return `Sea Zone ${seaZone.label}`;
    }
    return regionId;
  }

  protected embarkedUnits(transportInstanceId: string): readonly UnitInstance[] {
    return this.store.activePlayerUnits().filter((unit) => unit.transportedBy === transportInstanceId);
  }

  protected unloadDestinations(unitInstanceId: string): readonly string[] {
    return this.store.unloadDestinations(unitInstanceId);
  }

  protected deploy(playerId: string): void {
    const unitId = this.selectedUnitId();
    const regionId = this.selectedRegionId();
    if (!unitId || !regionId) {
      return;
    }
    this.store.deployUnit(playerId, unitId, regionId);
  }

  protected unload(playerId: string, unitInstanceId: string, destinationRegionId: string): void {
    if (!destinationRegionId) {
      return;
    }
    this.store.unloadUnit(playerId, unitInstanceId, destinationRegionId);
  }
}
