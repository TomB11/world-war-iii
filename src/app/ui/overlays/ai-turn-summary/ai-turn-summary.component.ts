import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { GameStore } from '../../../state/store';

/** Milliseconds between each faction section's staggered entrance. */
const FACTION_STAGGER_MS = 110;
/** Milliseconds between each action line's staggered entrance within a faction (after that faction's own header appears). */
const ACTION_STAGGER_MS = 55;
/** Caps how late an entrance animation can start — a turn with many factions/actions still finishes revealing itself promptly rather than trailing off for seconds. */
const MAX_STAGGER_DELAY_MS = 900;

/**
 * Solo Command Mode: a calm, dismissable review of what every AI faction did
 * on the turn(s) just played — shown once control is about to return to the
 * human, instead of the individual actions flashing by as transient toasts
 * (GameStore.aiTurnSummary, populated by AiTurnService.finishAiTurnLog).
 * Reading it and clicking Continue is the only way past it, matching
 * VictoryBannerComponent/CombatBoardComponent's full-screen overlay pattern.
 */
@Component({
  selector: 'wwiii-ai-turn-summary',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './ai-turn-summary.component.html',
  styleUrl: './ai-turn-summary.component.scss',
})
export class AiTurnSummaryComponent {
  protected readonly store = inject(GameStore);

  protected continue(): void {
    this.store.dismissAiTurnSummary();
  }

  protected factionDelayMs(factionIndex: number): number {
    return Math.min(factionIndex * FACTION_STAGGER_MS, MAX_STAGGER_DELAY_MS);
  }

  protected actionDelayMs(factionIndex: number, actionIndex: number): number {
    return Math.min(this.factionDelayMs(factionIndex) + 120 + actionIndex * ACTION_STAGGER_MS, MAX_STAGGER_DELAY_MS + 400);
  }
}
