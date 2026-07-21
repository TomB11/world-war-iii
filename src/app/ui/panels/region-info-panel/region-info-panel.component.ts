import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { GameStore } from '../../../state/store';
import { UnitInstance } from '../../../models/unit-instance.model';
import { UnitIconComponent } from '../../shared/unit-icon/unit-icon.component';

interface UnitGroup {
  unitId: string;
  unitName: string;
  ownerName: string;
  color: string;
  quantity: number;
}

@Component({
  selector: 'wwiii-region-info-panel',
  standalone: true,
  imports: [UnitIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './region-info-panel.component.html',
  styleUrl: './region-info-panel.component.scss',
})
export class RegionInfoPanelComponent {
  private readonly store = inject(GameStore);

  protected readonly region = this.store.selectedRegion;
  protected readonly seaZone = this.store.selectedSeaZone;

  protected readonly ownerName = computed(() => {
    const region = this.region();
    if (!region || !region.ownerId) {
      return 'Unclaimed';
    }
    return this.store.factions()[region.ownerId]?.name ?? region.ownerId;
  });

  protected readonly unitsHere = computed<readonly UnitGroup[]>(() => {
    const id = this.store.selectedRegionId();
    if (!id) {
      return [];
    }
    return this.groupUnits(this.store.unitsByRegion()[id] ?? []);
  });

  /**
   * A region is "contested" (PROJECT_RULES.md sections 7/8) when it holds
   * units from the active player AND from someone else — i.e. an attack has
   * moved units in and combat is pending. Splits the region's units into
   * defenders (everyone else) and attackers (the active player) so the panel
   * can render "defenders ⚔ attackers".
   */
  protected readonly contestedView = computed<{
    contested: boolean;
    defenders: readonly UnitGroup[];
    attackers: readonly UnitGroup[];
  }>(() => {
    const id = this.store.selectedRegionId();
    const activeId = this.store.state()?.activePlayerId;
    if (!id || !activeId) {
      return { contested: false, defenders: [], attackers: [] };
    }
    const units = this.store.unitsByRegion()[id] ?? [];
    const attackers = this.groupUnits(units.filter((u) => u.ownerId === activeId));
    const defenders = this.groupUnits(units.filter((u) => u.ownerId !== activeId));
    return { contested: attackers.length > 0 && defenders.length > 0, defenders, attackers };
  });

  private groupUnits(units: readonly UnitInstance[]): UnitGroup[] {
    const catalog = this.store.units();
    const factions = this.store.factions();
    const groups = new Map<string, UnitGroup>();
    for (const unit of units) {
      const key = `${unit.ownerId}:${unit.unitId}`;
      const existing = groups.get(key);
      if (existing) {
        existing.quantity += 1;
      } else {
        groups.set(key, {
          unitId: unit.unitId,
          unitName: catalog[unit.unitId]?.name ?? unit.unitId,
          ownerName: factions[unit.ownerId]?.name ?? unit.ownerId,
          color: factions[unit.ownerId]?.color ?? '#888888',
          quantity: 1,
        });
      }
    }
    return [...groups.values()];
  }

  /** Political Influence tokens on the selected region (PROJECT_RULES.md section 6), one entry per faction with at least one. */
  protected readonly influenceTokens = computed<
    readonly { factionId: string; factionName: string; color: string; count: number }[]
  >(() => {
    const tokens = this.region()?.influenceTokens;
    if (!tokens) {
      return [];
    }
    const factions = this.store.factions();
    return Object.entries(tokens)
      .filter(([, count]) => count > 0)
      .map(([factionId, count]) => ({
        factionId,
        factionName: factions[factionId]?.name ?? factionId,
        color: factions[factionId]?.color ?? '#888888',
        count,
      }));
  });
}
