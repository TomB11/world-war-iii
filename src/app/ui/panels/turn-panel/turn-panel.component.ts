import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { GameStore } from '../../../state/store';
import { GamePhase } from '../../../models/game-state.model';

const PHASE_LABELS: Readonly<Record<GamePhase, string>> = {
  buyUnits: 'Buy Units Phase',
  cyberAttack: 'Cyber Attack Phase',
  attackMoves: 'Attack Moves Phase',
  attack: 'Attack Phase',
  tacticalMoves: 'Tactical Moves Phase',
  placeNewUnits: 'Place New Units Phase',
  collectIncome: 'Collect Income Phase',
};

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
    return phase ? PHASE_LABELS[phase] : '';
  });

  protected readonly flagPath = computed(() => {
    const player = this.store.activePlayer();
    return player ? `assets/flags/${player.factionId}.png` : 'assets/flags/neutral.png';
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
