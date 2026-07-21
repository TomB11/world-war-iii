import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { GameStore } from '../../../state/store';

/**
 * Presentation-only color per Citizen Satisfaction zone (PROJECT_RULES.md
 * section 5, data/economy.json citizenSatisfactionZones). The zone
 * boundaries/order themselves are data-driven; only this color mapping is
 * a UI choice, kept local to this component.
 */
const ZONE_COLORS: Readonly<Record<string, string>> = {
  rebellion: '#7a1f1f',
  neutral: '#20242c',
  incomeBonusLow: '#c9a227',
  incomeBonusHigh: '#e0ac4d',
  victoryPointsLow: '#5c6470',
  victoryPointsHigh: '#8891a0',
};

interface TrackZone {
  readonly key: string;
  readonly color: string;
  readonly widthPercent: number;
}

@Component({
  selector: 'wwiii-citizen-satisfaction-track',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './citizen-satisfaction-track.component.html',
  styleUrl: './citizen-satisfaction-track.component.scss',
})
export class CitizenSatisfactionTrackComponent {
  protected readonly store = inject(GameStore);

  protected readonly satisfaction = computed(() => this.store.activePlayer()?.citizenSatisfaction ?? 0);
  protected readonly rebellionLevel = computed(() => this.store.activePlayer()?.rebellionLevel ?? 0);
  protected readonly victoryPoints = computed(() => this.store.activePlayer()?.victoryPoints ?? 0);

  protected readonly zones = computed<readonly TrackZone[]>(() => {
    const config = this.store.economyConfig();
    if (!config) {
      return [];
    }
    const total = config.citizenSatisfactionMax - config.citizenSatisfactionMin + 1;
    return Object.entries(config.citizenSatisfactionZones)
      .sort((a, b) => a[1].min - b[1].min)
      .map(([key, zone]) => ({
        key,
        color: ZONE_COLORS[key] ?? '#444444',
        widthPercent: ((zone.max - zone.min + 1) / total) * 100,
      }));
  });

  protected readonly markerPercent = computed(() => {
    const config = this.store.economyConfig();
    if (!config) {
      return 0;
    }
    const { citizenSatisfactionMin: min, citizenSatisfactionMax: max } = config;
    return ((this.satisfaction() - min) / (max - min)) * 100;
  });
}
