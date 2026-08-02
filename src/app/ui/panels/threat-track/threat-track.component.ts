import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { GameStore } from '../../../state/store';

/**
 * Solo Command Mode only: a small always-visible bar for the shared AI
 * Threat Track (GameState.aiConfig.threatLevel, 0..aiThreatTrackData().maxLevel)
 * — previously tracked internally with no visible UI at all. Hidden entirely
 * in hotseat play (aiConfig null). Mirrors CitizenSatisfactionTrackComponent's
 * layout/animated-marker convention so the two read as a matching pair.
 */
@Component({
  selector: 'wwiii-threat-track',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './threat-track.component.html',
  styleUrl: './threat-track.component.scss',
})
export class ThreatTrackComponent {
  protected readonly store = inject(GameStore);

  protected readonly threatLevel = computed(() => this.store.state()?.aiConfig?.threatLevel ?? 0);
  protected readonly maxLevel = computed(() => this.store.aiThreatTrackData()?.maxLevel ?? 10);
  protected readonly totalWarActive = computed(() => this.store.state()?.aiConfig?.totalWarActive ?? false);

  protected readonly fillPercent = computed(() => {
    const max = this.maxLevel();
    return max > 0 ? (this.threatLevel() / max) * 100 : 0;
  });
}
