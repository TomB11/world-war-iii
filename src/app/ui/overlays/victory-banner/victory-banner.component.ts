import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { GameStore } from '../../../state/store';

/** Full-screen banner shown once PROJECT_RULES.md section 2's win condition is met. */
@Component({
  selector: 'wwiii-victory-banner',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './victory-banner.component.html',
  styleUrl: './victory-banner.component.scss',
})
export class VictoryBannerComponent {
  protected readonly store = inject(GameStore);

  protected readonly winnerLabel = computed(() => {
    const status = this.store.victoryStatus();
    if (!status) {
      return '';
    }
    const factions = this.store.factions();
    if (status.type === 'solo') {
      return factions[status.winnerId]?.name ?? status.winnerId;
    }
    const teamFactionNames = Object.values(factions)
      .filter((faction) => faction.teamId === status.winnerId)
      .map((faction) => faction.name);
    return teamFactionNames.length > 0 ? teamFactionNames.join(' + ') : status.winnerId;
  });
}
