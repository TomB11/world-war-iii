import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { UnitIconComponent } from '../unit-icon/unit-icon.component';

/**
 * One "unit + quantity" card — icon in a framed slot, name × count label
 * below, optionally draggable. Shared by every place that lists a group of
 * same-type units for a region/sea-zone (RegionInfoPanelComponent's plain
 * unit list, contested-battle defenders/attackers, and sea-zone unit list —
 * previously four copies of the same markup block).
 *
 * Purely presentational: whether a drag is actually legal (active player's
 * own movable unit, correct phase, etc.) is the caller's business logic —
 * this only reports the raw pointerdown via `dragStart` and reflects
 * `draggable` as a CSS hook.
 */
@Component({
  selector: 'wwiii-unit-card',
  standalone: true,
  imports: [UnitIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './unit-card.component.html',
  styleUrl: './unit-card.component.scss',
})
export class UnitCardComponent {
  readonly unitId = input.required<string>();
  readonly unitName = input.required<string>();
  readonly ownerId = input.required<string | null>();
  readonly ownerName = input.required<string>();
  readonly color = input.required<string>();
  readonly quantity = input.required<number>();
  readonly draggable = input<boolean>(false);
  readonly iconSize = input<number>(84);

  readonly dragStart = output<PointerEvent>();
}
