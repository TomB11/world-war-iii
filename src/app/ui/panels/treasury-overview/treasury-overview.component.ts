import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { GameCoreStore } from '../../../state/core/game-core.store';

interface TreasuryEntry {
  readonly id: string;
  readonly name: string;
  readonly color: string;
  readonly treasury: number;
  readonly isActive: boolean;
  readonly isEliminated: boolean;
}

/** Header strip showing every faction's current treasury; the active faction is highlighted. */
@Component({
  selector: 'wwiii-treasury-overview',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './treasury-overview.component.html',
  styleUrl: './treasury-overview.component.scss',
})
export class TreasuryOverviewComponent {
  private readonly gameCoreStore = inject(GameCoreStore);

  protected readonly entries = computed<readonly TreasuryEntry[]>(() => {
    const state = this.gameCoreStore.state();
    if (!state) {
      return [];
    }
    const factions = this.gameCoreStore.factions();
    return state.players.map((player) => ({
      id: player.id,
      name: factions[player.factionId]?.name ?? player.displayName,
      color: factions[player.factionId]?.color ?? 'var(--wwiii-accent)',
      treasury: player.treasury,
      isActive: player.id === state.activePlayerId,
      isEliminated: player.isEliminated,
    }));
  });
}
