import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { GameCoreStore } from '../../../state/core/game-core.store';
import { AiStore } from '../../../state/ai/ai.store';

/**
 * Solo Command Mode only: a small always-visible bar for the shared AI
 * Threat Track (GameState.aiConfig.threatLevel, 0..aiThreatTrack().maxLevel)
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
  protected readonly gameCoreStore = inject(GameCoreStore);
  protected readonly aiStore = inject(AiStore);

  protected readonly threatLevel = computed(() => this.gameCoreStore.state()?.aiConfig?.threatLevel ?? 0);
  protected readonly maxLevel = computed(() => this.aiStore.aiThreatTrack()?.maxLevel ?? 10);
  protected readonly totalWarActive = computed(() => this.gameCoreStore.state()?.aiConfig?.totalWarActive ?? false);

  protected readonly fillPercent = computed(() => {
    const max = this.maxLevel();
    return max > 0 ? (this.threatLevel() / max) * 100 : 0;
  });
}
