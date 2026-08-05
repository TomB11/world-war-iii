import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { GameCoreStore } from '../../../state/core/game-core.store';
import { CyberAttackStore } from '../../../state/cyber/cyber-attack.store';
import { PlayerState } from '../../../models/player.model';
import { Region } from '../../../models/region.model';

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

  protected readonly hackTargetId = signal<string>('');
  protected readonly influenceTargetId = signal<string>('');

  protected readonly isCyberAttackPhase = computed(() => this.gameCoreStore.state()?.phase === 'cyberAttack');
  protected readonly cost = computed(() => this.gameCoreStore.economyConfig()?.cyberAttackCost ?? 0);
  protected readonly hackUpgradeCost = computed(() => this.gameCoreStore.economyConfig()?.hackLevelUpgradeCost ?? 0);
  protected readonly hackLevelMax = computed(() => this.gameCoreStore.economyConfig()?.hackLevelMax ?? 0);

  /** 1..hackLevelMax, for rendering the Hack Level progress track as discrete pips. */
  protected readonly hackLevelSteps = computed(() => {
    const max = this.hackLevelMax();
    return Array.from({ length: max }, (_, index) => index + 1);
  });

  /** Every other non-eliminated, non-allied player, as possible Hack targets — a teammate (PROJECT_RULES.md section 2) is never a legal target, hacking is an attack. */
  protected readonly hackTargets = computed<readonly PlayerState[]>(() => {
    const state = this.gameCoreStore.state();
    const activeId = state?.activePlayerId;
    if (!state || !activeId) {
      return [];
    }
    return state.players.filter(
      (player) => player.id !== activeId && !player.isEliminated && this.gameCoreStore.isHostileTo(player.id, activeId),
    );
  });

  /** Every neutral (unowned) region, as possible Political Influence targets. */
  protected readonly neutralRegions = computed<readonly Region[]>(() =>
    Object.values(this.gameCoreStore.regions()).filter((region) => region.ownerId === null),
  );

  protected factionName(playerId: string): string {
    return this.gameCoreStore.factions()[playerId]?.name ?? playerId;
  }

  protected influenceTokensForId(regionId: string): string {
    const tokens = this.gameCoreStore.regions()[regionId]?.influenceTokens;
    if (!tokens || Object.keys(tokens).length === 0) {
      return 'no tokens yet';
    }
    return Object.entries(tokens)
      .map(([factionId, count]) => `${this.factionName(factionId)}: ${count}`)
      .join(', ');
  }

  protected attemptHack(playerId: string): void {
    const targetId = this.hackTargetId();
    if (!targetId) {
      return;
    }
    this.cyberAttackStore.hack(playerId, targetId);
  }

  protected attemptPoliticalInfluence(playerId: string): void {
    const regionId = this.influenceTargetId();
    if (!regionId) {
      return;
    }
    this.cyberAttackStore.politicalInfluence(playerId, regionId);
  }

  protected attemptUpgradeHackLevel(playerId: string): void {
    this.cyberAttackStore.upgradeHackLevel(playerId);
  }
}
