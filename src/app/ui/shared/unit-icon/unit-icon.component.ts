import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * The same tinted unit silhouette used on the map (assets/units/*.png),
 * reusable in ordinary HTML/DOM contexts (panels, lists) via a CSS mask —
 * canvas-based tinting (ui/map/rendering/unit-icon-images.ts) only works on
 * a &lt;canvas&gt;, this is the DOM equivalent.
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
  readonly color = input<string>('#888888');
  readonly size = input<number>(20);

  protected readonly imagePath = () => `assets/units/${this.unitId()}.png`;
}
