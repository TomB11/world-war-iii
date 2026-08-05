import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { GameCoreStore } from '../../../state/core/game-core.store';
import { EconomyStore } from '../../../state/economy/economy.store';
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
  protected readonly gameCoreStore = inject(GameCoreStore);
  protected readonly economyStore = inject(EconomyStore);

  protected readonly selectedUnitId = signal<string>('');
  protected readonly quantity = signal<number>(1);
  protected readonly spendAmount = signal<number>(5);

  protected readonly unitList = () => Object.values(this.gameCoreStore.units());

  protected readonly decayPerTurn = computed(() => this.gameCoreStore.economyConfig()?.citizenSatisfactionDecayPerTurn ?? 0);

  protected readonly activePlayerColor = computed(() => {
    const player = this.gameCoreStore.activePlayer();
    if (!player) {
      return '#888888';
    }
    return this.gameCoreStore.factions()[player.factionId]?.color ?? '#888888';
  });

  protected readonly activePlayerFactionId = computed(() => this.gameCoreStore.activePlayer()?.factionId ?? null);

  protected unitName(unitId: string): string {
    return this.gameCoreStore.units()[unitId]?.name ?? unitId;
  }

  /** Selecting a different unit resets the quantity stepper back to 1 (re-clicking the already-selected unit leaves it as-is). */
  protected onSelectUnit(unitId: string): void {
    if (this.selectedUnitId() !== unitId) {
      this.selectedUnitId.set(unitId);
      this.quantity.set(1);
    }
  }

  protected setQuantity(value: number): void {
    this.quantity.set(Math.max(1, Math.floor(value) || 1));
  }

  protected incrementQuantity(): void {
    this.quantity.update((q) => q + 1);
  }

  protected decrementQuantity(): void {
    this.quantity.update((q) => Math.max(1, q - 1));
  }

  protected purchase(playerId: string): void {
    const unitId = this.selectedUnitId();
    if (!unitId) {
      return;
    }
    this.economyStore.purchaseUnit(playerId, unitId, this.quantity());
  }

  protected spendOnSatisfaction(playerId: string): void {
    const amount = this.spendAmount();
    if (!amount || amount <= 0) {
      return;
    }
    this.economyStore.raiseCitizenSatisfaction(playerId, amount);
  }
}
