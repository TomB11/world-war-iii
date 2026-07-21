import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { GameStore } from '../../../state/store';

@Component({
  selector: 'wwiii-advance-phase-bar',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './advance-phase-bar.component.html',
  styleUrl: './advance-phase-bar.component.scss',
})
export class AdvancePhaseBarComponent {
  protected readonly store = inject(GameStore);

  protected advance(playerId: string): void {
    const phase = this.store.state()?.phase;
    if (phase === 'collectIncome') {
      this.store.endTurn(playerId);
    } else {
      this.store.advancePhase(playerId);
    }
  }
}
