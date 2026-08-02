import { Command, CommandResult } from '../../interfaces/command';
import { GameState } from '../../models/game-state.model';
import { GameEngineEvent } from '../../interfaces/game-events';
import { AiPurchaseChartData } from '../../models/ai-purchase-chart.model';
import { RulesEngine } from '../rules-engine';
import { rollDie } from '../random';
import { DICE_SIDES } from '../constants/dice.constants';

/**
 * Solo Command Mode's "AI Purchase Chart": rolls 1d6 to decide what the AI
 * buys this Buy Units phase. Rolling 6 ("Special Unit") additionally rolls
 * among purchaseChart.specialUnitOptions, since the rulebook leaves that
 * pick to chance rather than a fixed unit list. This command only decides
 * *what* to buy — the caller (services/ai-turn.service.ts) still dispatches
 * a normal PurchaseUnitCommand per affordable unit, exactly like a human
 * clicking Buy.
 */
export class RollAiPurchaseChartCommand implements Command {
  readonly type = 'RollAiPurchaseChart';

  constructor(
    private readonly playerId: string,
    private readonly purchaseChart: AiPurchaseChartData,
    private readonly rules: RulesEngine = new RulesEngine(),
  ) {}

  execute(state: GameState): CommandResult {
    if (state.activePlayerId !== this.playerId || state.phase !== 'buyUnits') {
      return { state, events: [] };
    }

    const chartRoll = rollDie(state.randomSeed, DICE_SIDES);
    let nextSeed = chartRoll.nextSeed;
    let unitIds: readonly string[] = this.purchaseChart.chart[String(chartRoll.result)] ?? [];
    let specialRoll: number | null = null;

    if (chartRoll.result === 6 && this.purchaseChart.specialUnitOptions.length > 0) {
      const specialDie = rollDie(nextSeed, this.purchaseChart.specialUnitOptions.length);
      nextSeed = specialDie.nextSeed;
      specialRoll = specialDie.result;
      const chosenUnitId = this.purchaseChart.specialUnitOptions[specialDie.result - 1];
      unitIds = chosenUnitId ? [chosenUnitId] : [];
    }

    const events: readonly GameEngineEvent[] = [
      {
        type: 'AiPurchaseChartRolled',
        playerId: this.playerId,
        roll: chartRoll.result,
        specialRoll,
        unitIds,
      },
    ];
    return { state: { ...state, randomSeed: nextSeed }, events };
  }
}
