import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { AIRBORNE_INFANTRY_UNIT_ID, getFactionIconPath } from '../unit-faction-icons';

/**
 * The unit icon used in ordinary HTML/DOM contexts (panels, lists) — the
 * canvas map has its own equivalent (ui/map/rendering/unit-icon-images.ts).
 * Two render paths:
 * - Dedicated per-faction art (ui/shared/unit-faction-icons.ts): already
 *   fully colored, rendered as a plain `<img>`.
 * - Otherwise, the shared tinted silhouette (assets/units/*.png) via a CSS
 *   mask — canvas-based tinting only works on a `<canvas>`, this is the DOM
 *   equivalent.
 */
@Component({
  selector: 'wwiii-unit-icon',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './unit-icon.component.html',
  styleUrl: './unit-icon.component.scss',
  host: {
    '[style.width.px]': 'size()',
    '[style.height.px]': 'size()',
  },
})
export class UnitIconComponent {
  readonly unitId = input.required<string>();
  readonly ownerId = input<string | null>(null);
  readonly color = input<string>('#888888');
  readonly size = input<number>(20);

  protected readonly dedicatedIconPath = computed(() => getFactionIconPath(this.unitId(), this.ownerId()));
  protected readonly silhouetteImagePath = () => `assets/units/${this.unitId()}.png`;
  protected readonly isAirborne = computed(() => this.unitId() === AIRBORNE_INFANTRY_UNIT_ID);
}
