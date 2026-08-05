import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { GameCoreStore } from '../../../state/core/game-core.store';
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
  protected readonly gameCoreStore = inject(GameCoreStore);

  protected readonly phaseLabel = computed(() => {
    const phase = this.gameCoreStore.state()?.phase;
    return phase ? `${PHASE_LABELS[phase]} Phase` : '';
  });

  protected readonly capitalImagePath = computed(() => {
    const factionId = this.gameCoreStore.activePlayer()?.factionId;
    if (!factionId) {
      return null;
    }
    const imageId = CAPITAL_IMAGE_IDS[factionId] ?? factionId;
    return `assets/capitals/${imageId}.jpg`;
  });

  protected readonly reserveCount = computed(() => {
    const player = this.gameCoreStore.activePlayer();
    if (!player) {
      return 0;
    }
    return player.reserve.reduce((total, entry) => total + entry.quantity, 0);
  });

  protected readonly treasury = computed(() => this.gameCoreStore.activePlayer()?.treasury ?? 0);

  protected readonly ownedRegionCount = computed(() => {
    const player = this.gameCoreStore.activePlayer();
    if (!player) {
      return 0;
    }
    return Object.values(this.gameCoreStore.regions()).filter((region) => region.ownerId === player.id).length;
  });

  protected readonly ownedVictoryStarCount = computed(() => {
    const player = this.gameCoreStore.activePlayer();
    if (!player) {
      return 0;
    }
    return Object.values(this.gameCoreStore.regions()).filter(
      (region) => region.ownerId === player.id && region.isVictoryStar,
    ).length;
  });
}
