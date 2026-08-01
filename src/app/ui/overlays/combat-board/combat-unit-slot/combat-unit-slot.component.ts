import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { CombatDieRoll } from '../../../../models/region-combat.model';
import { UnitIconComponent } from '../../../shared/unit-icon/unit-icon.component';

/**
 * One unit's icon + optional die-roll badge on the combat board — one of
 * three shapes: a clickable "pick this one as a casualty" button
 * (still-alive units), an inert casualty slot (dead units, shown smaller and
 * grayscale via CSS), or an armed-missile placeholder (pulsing glow, no
 * roll badge, awaiting FireMissileCommand). Shared by both attacker/defender
 * columns' live/casualty rows and the armed-missile slot — previously five
 * near-identical blocks in CombatBoardComponent's template.
 */
@Component({
  selector: 'wwiii-combat-unit-slot',
  standalone: true,
  imports: [UnitIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './combat-unit-slot.component.html',
  styleUrl: './combat-unit-slot.component.scss',
})
export class CombatUnitSlotComponent {
  readonly unitId = input.required<string>();
  readonly unitName = input.required<string>();
  readonly ownerId = input<string | null>(null);
  readonly color = input<string>('#888888');
  readonly size = input<number>(34);
  readonly rollInfo = input<CombatDieRoll | null>(null);
  /** Still alive (clickable button) vs a casualty/armed-missile (inert display). */
  readonly interactive = input<boolean>(false);
  /** Only meaningful while `interactive` — whether this side is currently allowed to pick a casualty. */
  readonly clickable = input<boolean>(false);
  /** Only meaningful while not `interactive` — an armed missile awaiting its roll, instead of an ordinary casualty. */
  readonly armed = input<boolean>(false);

  readonly unitClick = output<void>();
}
