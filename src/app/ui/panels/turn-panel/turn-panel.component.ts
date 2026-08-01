import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { GameStore } from '../../../state/store';
import { PHASE_LABELS } from '../../../core/constants/phase-labels.constants';
import { CAPITAL_IMAGE_IDS } from './turn-panel.constants';

@Component({
  selector: 'wwiii-turn-panel',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './turn-panel.component.html',
  styleUrl: './turn-panel.component.scss',
})
export class TurnPanelComponent {
  protected readonly store = inject(GameStore);

  protected readonly phaseLabel = computed(() => {
    const phase = this.store.state()?.phase;
    return phase ? `${PHASE_LABELS[phase]} Phase` : '';
  });

  protected readonly capitalImagePath = computed(() => {
    const factionId = this.store.activePlayer()?.factionId;
    if (!factionId) {
      return null;
    }
    const imageId = CAPITAL_IMAGE_IDS[factionId] ?? factionId;
    return `assets/capitals/${imageId}.jpg`;
  });

  protected readonly reserveCount = computed(() => {
    const player = this.store.activePlayer();
    if (!player) {
      return 0;
    }
    return player.reserve.reduce((total, entry) => total + entry.quantity, 0);
  });

  protected readonly treasury = computed(() => this.store.activePlayer()?.treasury ?? 0);

  protected readonly ownedRegionCount = computed(() => {
    const player = this.store.activePlayer();
    if (!player) {
      return 0;
    }
    return Object.values(this.store.regions()).filter((region) => region.ownerId === player.id).length;
  });

  protected readonly ownedVictoryStarCount = computed(() => {
    const player = this.store.activePlayer();
    if (!player) {
      return 0;
    }
    return Object.values(this.store.regions()).filter(
      (region) => region.ownerId === player.id && region.isVictoryStar,
    ).length;
  });
}
