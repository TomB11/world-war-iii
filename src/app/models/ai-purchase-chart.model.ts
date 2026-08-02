/**
 * Solo Command Mode's "AI Purchase Chart" (data/ai-purchase-chart.json):
 * rolling 1d6 during the AI's Buy Units phase picks which unit(s) it buys.
 * Roll 6 ("Special Unit") additionally rolls among specialUnitOptions,
 * since the rulebook leaves that pick to chance rather than a fixed list.
 */
export interface AiPurchaseChartData {
  /** Keyed "1".."5" -> unit ids to buy. "6" is intentionally absent — see specialUnitOptions. */
  readonly chart: Readonly<Record<string, readonly string[]>>;
  readonly specialUnitOptions: readonly string[];
}
