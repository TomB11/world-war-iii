/**
 * One AI faction's narrated actions from a completed turn (Solo Command
 * Mode), shown to the human player in a review modal after all consecutive
 * AI factions finish (GameStore.aiTurnSummary / AiTurnSummaryComponent) —
 * a calm, dismissable summary instead of transient toasts.
 */
export interface AiTurnSummaryEntry {
  readonly playerId: string;
  readonly playerName: string;
  readonly color: string;
  readonly actions: readonly string[];
}
