import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { GameCoreStore } from '../../../state/core/game-core.store';
import { MapUiStore } from '../../../state/map/map-ui.store';
import { MovementStore } from '../../../state/movement/movement.store';
import { UnitInstance } from '../../../models/unit-instance.model';
import { UnitCardComponent } from '../../shared/unit-card/unit-card.component';
import { MOVEMENT_PHASES } from '../../../core/constants/game.constants';

interface UnitGroup {
  unitId: string;
  unitName: string;
  ownerId: string;
  ownerName: string;
  color: string;
  quantity: number;
}

interface LoadedTransport {
  id: string;
  unitId: string;
  label: string;
  ownerId: string;
  ownerName: string;
  color: string;
  cargo: readonly UnitGroup[];
}

@Component({
  selector: 'wwiii-region-info-panel',
  standalone: true,
  imports: [UnitCardComponent, NgTemplateOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './region-info-panel.component.html',
  styleUrl: './region-info-panel.component.scss',
})
export class RegionInfoPanelComponent {
  private readonly gameCoreStore = inject(GameCoreStore);
  private readonly mapUiStore = inject(MapUiStore);
  private readonly movementStore = inject(MovementStore);

  protected readonly region = this.mapUiStore.selectedRegion;
  protected readonly seaZone = this.mapUiStore.selectedSeaZone;

  protected close(): void {
    this.mapUiStore.setSelected(null);
  }

  protected readonly activePlayerId = computed(() => this.gameCoreStore.state()?.activePlayerId ?? null);

  /**
   * Lets a unit shown here be picked up the same way its map icon would be
   * (WorldMapComponent.tryPickUpUnit / GameStore.startExternalUnitDrag) — a
   * no-op for anything that isn't the active player's own movable unit, so
   * it's safe to wire on every unit-card unconditionally.
   */
  protected startDrag(entry: UnitGroup, event: PointerEvent, instanceId?: string): void {
    const state = this.gameCoreStore.state();
    const regionId = this.mapUiStore.selectedRegionId();
    if (!state || !regionId || entry.ownerId !== state.activePlayerId || !MOVEMENT_PHASES.includes(state.phase)) {
      return;
    }
    const candidate = (this.gameCoreStore.unitsByRegion()[regionId] ?? []).find((u) =>
      instanceId
        ? u.id === instanceId && u.transportedBy === null && u.movesRemaining > 0
        : u.unitId === entry.unitId && u.ownerId === entry.ownerId && u.transportedBy === null && u.movesRemaining > 0,
    );
    if (!candidate) {
      return;
    }
    event.preventDefault();
    this.movementStore.startExternalUnitDrag(candidate.id);
  }

  protected startTransportDrag(transport: LoadedTransport, event: PointerEvent): void {
    this.startDrag(
      {
        unitId: transport.unitId,
        unitName: transport.label,
        ownerId: transport.ownerId,
        ownerName: transport.ownerName,
        color: transport.color,
        quantity: 1,
      },
      event,
      transport.id,
    );
  }

  protected readonly ownerName = computed(() => {
    const region = this.region();
    if (!region || !region.ownerId) {
      return 'Unclaimed';
    }
    return this.gameCoreStore.factions()[region.ownerId]?.name ?? region.ownerId;
  });

  protected readonly unitsHere = computed<readonly UnitGroup[]>(() => {
    const id = this.mapUiStore.selectedRegionId();
    if (!id) {
      return [];
    }
    return this.groupUnits(this.partitionTransports(this.gameCoreStore.unitsByRegion()[id] ?? []).free);
  });

  /** Transports in the selected location that currently carry units, each listed with its own cargo so the player can tell which ship holds what. */
  protected readonly loadedTransports = computed<readonly LoadedTransport[]>(() => {
    const id = this.mapUiStore.selectedRegionId();
    if (!id) {
      return [];
    }
    return this.partitionTransports(this.gameCoreStore.unitsByRegion()[id] ?? []).loaded;
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
    const id = this.mapUiStore.selectedRegionId();
    const activeId = this.gameCoreStore.state()?.activePlayerId;
    if (!id || !activeId) {
      return { contested: false, defenders: [], attackers: [] };
    }
    const units = this.gameCoreStore.unitsByRegion()[id] ?? [];
    const free = this.partitionTransports(units).free;
    const attackers = this.groupUnits(free.filter((u) => u.ownerId === activeId));
    const defenders = this.groupUnits(free.filter((u) => u.ownerId !== activeId));
    const contested = units.some((u) => u.ownerId === activeId) && units.some((u) => u.ownerId !== activeId);
    return { contested, defenders, attackers };
  });

  /**
   * Splits a location's units into "free" ones (listed normally) and loaded
   * transports. A transport with cargo is pulled out of the free list together
   * with everything embarked on it; same-type loaded transports of one owner
   * get "#1", "#2"... labels so they can be told apart.
   */
  private partitionTransports(units: readonly UnitInstance[]): { free: UnitInstance[]; loaded: LoadedTransport[] } {
    const catalog = this.gameCoreStore.units();
    const factions = this.gameCoreStore.factions();
    const cargoByTransport = new Map<string, UnitInstance[]>();
    for (const unit of units) {
      if (unit.transportedBy !== null) {
        cargoByTransport.set(unit.transportedBy, [...(cargoByTransport.get(unit.transportedBy) ?? []), unit]);
      }
    }

    const carriers = units.filter((unit) => cargoByTransport.has(unit.id));
    const sameTypeCount = new Map<string, number>();
    for (const carrier of carriers) {
      const key = `${carrier.ownerId}:${carrier.unitId}`;
      sameTypeCount.set(key, (sameTypeCount.get(key) ?? 0) + 1);
    }
    const seenOfType = new Map<string, number>();
    const loaded = carriers.map((carrier): LoadedTransport => {
      const key = `${carrier.ownerId}:${carrier.unitId}`;
      const ordinal = (seenOfType.get(key) ?? 0) + 1;
      seenOfType.set(key, ordinal);
      const name = catalog[carrier.unitId]?.name ?? carrier.unitId;
      return {
        id: carrier.id,
        unitId: carrier.unitId,
        label: (sameTypeCount.get(key) ?? 0) > 1 ? `${name} #${ordinal}` : name,
        ownerId: carrier.ownerId,
        ownerName: factions[carrier.ownerId]?.name ?? carrier.ownerId,
        color: factions[carrier.ownerId]?.color ?? '#888888',
        cargo: this.groupUnits(cargoByTransport.get(carrier.id) ?? []),
      };
    });

    const free = units.filter((unit) => unit.transportedBy === null && !cargoByTransport.has(unit.id));
    return { free, loaded };
  }

  private groupUnits(units: readonly UnitInstance[]): UnitGroup[] {
    const catalog = this.gameCoreStore.units();
    const factions = this.gameCoreStore.factions();
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
          ownerId: unit.ownerId,
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
    const factions = this.gameCoreStore.factions();
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
