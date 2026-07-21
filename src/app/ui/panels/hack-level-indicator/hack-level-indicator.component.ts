import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { GameStore } from '../../../state/store';

/** Active player's Hack Level (PROJECT_RULES.md section 6), shown in the header next to the Citizen Satisfaction track. */
@Component({
  selector: 'wwiii-hack-level-indicator',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './hack-level-indicator.component.html',
  styleUrl: './hack-level-indicator.component.scss',
})
export class HackLevelIndicatorComponent {
  protected readonly store = inject(GameStore);
}
