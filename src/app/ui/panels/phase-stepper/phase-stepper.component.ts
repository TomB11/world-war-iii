import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { GameStore } from '../../../state/store';
import { GamePhase } from '../../../models/game-state.model';
import { TURN_PHASE_ORDER } from '../../../core/constants/game.constants';

const PHASE_LABELS: Readonly<Record<GamePhase, string>> = {
  buyUnits: 'Buy Units',
  cyberAttack: 'Cyber Attack',
  attackMoves: 'Attack Moves',
  attack: 'Attack',
  tacticalMoves: 'Tactical Moves',
  placeNewUnits: 'Place Units',
  collectIncome: 'Collect Income',
};

interface PhaseStep {
  readonly phase: GamePhase;
  readonly label: string;
  readonly isCurrent: boolean;
  readonly isPast: boolean;
}

/** Horizontal "you are here" stepper of the 7 turn phases, current one highlighted (PROJECT_RULES.md section 3). */
@Component({
  selector: 'wwiii-phase-stepper',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './phase-stepper.component.html',
  styleUrl: './phase-stepper.component.scss',
})
export class PhaseStepperComponent {
  protected readonly store = inject(GameStore);

  protected readonly steps = computed<readonly PhaseStep[]>(() => {
    const current = this.store.state()?.phase;
    const currentIndex = current ? TURN_PHASE_ORDER.indexOf(current) : -1;
    return TURN_PHASE_ORDER.map((phase, index) => ({
      phase,
      label: PHASE_LABELS[phase],
      isCurrent: phase === current,
      isPast: currentIndex >= 0 && index < currentIndex,
    }));
  });
}
