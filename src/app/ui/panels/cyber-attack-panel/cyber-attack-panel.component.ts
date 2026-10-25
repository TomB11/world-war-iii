import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { GameCoreStore } from '../../../state/core/game-core.store';
import { CyberAttackStore } from '../../../state/cyber/cyber-attack.store';
import { MapUiStore } from '../../../state/map/map-ui.store';

@Component({
  selector: 'wwiii-cyber-attack-panel',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './cyber-attack-panel.component.html',
  styleUrl: './cyber-attack-panel.component.scss',
})
export class CyberAttackPanelComponent {
  protected readonly gameCoreStore = inject(GameCoreStore);
  protected readonly cyberAttackStore = inject(CyberAttackStore);
  protected readonly mapUiStore = inject(MapUiStore);

  protected readonly isCyberAttackPhase = computed(() => this.gameCoreStore.state()?.phase === 'cyberAttack');
  protected readonly cost = computed(() => this.gameCoreStore.economyConfig()?.cyberAttackCost ?? 0);
  protected readonly hackUpgradeCost = computed(() => this.gameCoreStore.economyConfig()?.hackLevelUpgradeCost ?? 0);
  protected readonly hackLevelMax = computed(() => this.gameCoreStore.economyConfig()?.hackLevelMax ?? 0);

  /** 1..hackLevelMax, for rendering the Hack Level progress track as discrete pips. */
  protected readonly hackLevelSteps = computed(() => {
    const max = this.hackLevelMax();
    return Array.from({ length: max }, (_, index) => index + 1);
  });

  protected readonly armedKind = computed(() => {
    const kind = this.mapUiStore.pendingAction()?.kind;
    return kind === 'hack' || kind === 'influence' ? kind : null;
  });

  /** Hint shown while a Hack/Influence is armed — what to click next, or why nothing is highlighted. */
  protected readonly armedHint = computed<string | null>(() => {
    const pending = this.mapUiStore.pendingAction();
    if (!pending || (pending.kind !== 'hack' && pending.kind !== 'influence')) {
      return null;
    }
    if (pending.kind === 'hack') {
      return pending.destinations.length > 0
        ? 'Click a highlighted capital on the map to hack its faction.'
        : 'No rival faction can be hacked right now.';
    }
    return pending.destinations.length > 0
      ? 'Click a highlighted neutral region on the map to influence it.'
      : 'No neutral regions remain.';
  });

  protected armHack(playerId: string): void {
    this.cyberAttackStore.armHack(playerId);
  }

  protected armInfluence(playerId: string): void {
    this.cyberAttackStore.armInfluence(playerId);
  }

  protected attemptUpgradeHackLevel(playerId: string): void {
    this.cyberAttackStore.upgradeHackLevel(playerId);
  }
}
