import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { GameCoreStore } from '../../../state/core/game-core.store';
import { MapUiStore } from '../../../state/map/map-ui.store';
import { CombatStore } from '../../../state/combat/combat.store';
import { MovementStore } from '../../../state/movement/movement.store';
import { EconomyStore } from '../../../state/economy/economy.store';
import { CyberAttackStore } from '../../../state/cyber/cyber-attack.store';
import { routeTurnCycleEvents } from '../../../state/shared/route-turn-cycle-events';

@Component({
  selector: 'wwiii-advance-phase-bar',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './advance-phase-bar.component.html',
  styleUrl: './advance-phase-bar.component.scss',
})
export class AdvancePhaseBarComponent {
  protected readonly gameCoreStore = inject(GameCoreStore);
  private readonly mapUiStore = inject(MapUiStore);
  private readonly combatStore = inject(CombatStore);
  private readonly movementStore = inject(MovementStore);
  private readonly economyStore = inject(EconomyStore);
  private readonly cyberAttackStore = inject(CyberAttackStore);

  protected advance(playerId: string): void {
    const phase = this.gameCoreStore.state()?.phase;
    const events = phase === 'collectIncome' ? this.gameCoreStore.endTurn(playerId) : this.gameCoreStore.advancePhase(playerId);
    routeTurnCycleEvents(events, {
      mapUiStore: this.mapUiStore,
      combatStore: this.combatStore,
      movementStore: this.movementStore,
      economyStore: this.economyStore,
      cyberAttackStore: this.cyberAttackStore,
    });
  }
}
