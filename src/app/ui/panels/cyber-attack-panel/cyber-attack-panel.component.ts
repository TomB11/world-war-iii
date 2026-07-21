import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { GameStore } from '../../../state/store';
import { PlayerState } from '../../../models/player.model';
import { Region } from '../../../models/region.model';

@Component({
  selector: 'wwiii-cyber-attack-panel',
  standalone: true,
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './cyber-attack-panel.component.html',
  styleUrl: './cyber-attack-panel.component.scss',
})
export class CyberAttackPanelComponent {
  protected readonly store = inject(GameStore);

  protected readonly hackTargetId = signal<string>('');
  protected readonly influenceTargetId = signal<string>('');

  protected readonly isCyberAttackPhase = computed(() => this.store.state()?.phase === 'cyberAttack');
  protected readonly cost = computed(() => this.store.economyConfig()?.cyberAttackCost ?? 0);
  protected readonly hackUpgradeCost = computed(() => this.store.economyConfig()?.hackLevelUpgradeCost ?? 0);
  protected readonly hackLevelMax = computed(() => this.store.economyConfig()?.hackLevelMax ?? 0);

  /** Every other non-eliminated player, as possible Hack targets. */
  protected readonly hackTargets = computed<readonly PlayerState[]>(() => {
    const state = this.store.state();
    const activeId = state?.activePlayerId;
    if (!state) {
      return [];
    }
    return state.players.filter((player) => player.id !== activeId && !player.isEliminated);
  });

  /** Every neutral (unowned) region, as possible Political Influence targets. */
  protected readonly neutralRegions = computed<readonly Region[]>(() =>
    Object.values(this.store.regions()).filter((region) => region.ownerId === null),
  );

  protected factionName(playerId: string): string {
    return this.store.factions()[playerId]?.name ?? playerId;
  }

  protected influenceTokensForId(regionId: string): string {
    const tokens = this.store.regions()[regionId]?.influenceTokens;
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
    this.store.hack(playerId, targetId);
  }

  protected attemptPoliticalInfluence(playerId: string): void {
    const regionId = this.influenceTargetId();
    if (!regionId) {
      return;
    }
    this.store.politicalInfluence(playerId, regionId);
  }

  protected attemptUpgradeHackLevel(playerId: string): void {
    this.store.upgradeHackLevel(playerId);
  }
}
