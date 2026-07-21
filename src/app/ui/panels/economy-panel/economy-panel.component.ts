import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { GameStore } from '../../../state/store';
import { UnitIconComponent } from '../../shared/unit-icon/unit-icon.component';

@Component({
  selector: 'wwiii-economy-panel',
  standalone: true,
  imports: [FormsModule, UnitIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './economy-panel.component.html',
  styleUrl: './economy-panel.component.scss',
})
export class EconomyPanelComponent {
  protected readonly store = inject(GameStore);

  protected readonly selectedUnitId = signal<string>('');
  protected readonly quantity = signal<number>(1);
  protected readonly spendAmount = signal<number>(5);

  protected readonly unitList = () => Object.values(this.store.units());

  protected readonly decayPerTurn = computed(() => this.store.economyConfig()?.citizenSatisfactionDecayPerTurn ?? 0);

  protected readonly activePlayerColor = computed(() => {
    const player = this.store.activePlayer();
    if (!player) {
      return '#888888';
    }
    return this.store.factions()[player.factionId]?.color ?? '#888888';
  });

  protected unitName(unitId: string): string {
    return this.store.units()[unitId]?.name ?? unitId;
  }

  protected purchase(playerId: string): void {
    const unitId = this.selectedUnitId();
    if (!unitId) {
      return;
    }
    this.store.purchaseUnit(playerId, unitId, this.quantity());
  }

  protected spendOnSatisfaction(playerId: string): void {
    const amount = this.spendAmount();
    if (!amount || amount <= 0) {
      return;
    }
    this.store.raiseCitizenSatisfaction(playerId, amount);
  }
}
