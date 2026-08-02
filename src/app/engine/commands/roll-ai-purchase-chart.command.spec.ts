import { RollAiPurchaseChartCommand } from './roll-ai-purchase-chart.command';
import { AiPurchaseChartData } from '../../models/ai-purchase-chart.model';
import { player, testState } from '../test-fixtures';

describe('RollAiPurchaseChartCommand', () => {
  const purchaseChart: AiPurchaseChartData = {
    chart: {
      '1': ['infantry', 'infantry'],
      '2': ['infantry', 'tank'],
      '3': ['tank', 'helicopter'],
      '4': ['rocket-system', 'infantry'],
      '5': ['fighter'],
    },
    specialUnitOptions: ['destroyer', 'submarine', 'missile-a'],
  };

  function baseState(randomSeed: number) {
    return testState({
      phase: 'buyUnits',
      activePlayerId: 'p1',
      players: [player({ id: 'p1' })],
      randomSeed,
    });
  }

  it('is a no-op outside the Buy Units phase', () => {
    const state = testState({ phase: 'attackMoves', activePlayerId: 'p1', players: [player({ id: 'p1' })] });
    const result = new RollAiPurchaseChartCommand('p1', purchaseChart).execute(state);
    expect(result.events).toEqual([]);
    expect(result.state).toBe(state);
  });

  it('is a no-op when it is not this player\'s turn', () => {
    const state = baseState(1);
    const result = new RollAiPurchaseChartCommand('p2', purchaseChart).execute(state);
    expect(result.events).toEqual([]);
    expect(result.state).toBe(state);
  });

  it('rolls 1d6 and resolves the chart entry for rolls 1-5, advancing the seed', () => {
    // Seed 1 is known (from other specs in this codebase) to roll a 2 on a d6.
    const state = baseState(1);
    const result = new RollAiPurchaseChartCommand('p1', purchaseChart).execute(state);

    expect(result.events.length).toBe(1);
    const event = result.events[0];
    if (event.type !== 'AiPurchaseChartRolled') {
      throw new Error('Expected an AiPurchaseChartRolled event');
    }
    expect(event.playerId).toBe('p1');
    expect(event.roll).toBeGreaterThanOrEqual(1);
    expect(event.roll).toBeLessThanOrEqual(6);
    if (event.roll <= 5) {
      expect(event.unitIds).toEqual(purchaseChart.chart[String(event.roll)]);
      expect(event.specialRoll).toBeNull();
    }
    expect(result.state.randomSeed).not.toBe(state.randomSeed);
  });

  it('rolls a second die among specialUnitOptions when the chart roll is 6, and resolves to exactly one unit id', () => {
    // Sweep seeds until we find one that rolls a 6 on the first die, to exercise the special-unit branch deterministically.
    let seed = 1;
    let sixRolled = false;
    let result: ReturnType<RollAiPurchaseChartCommand['execute']> | null = null;
    for (let attempt = 0; attempt < 200 && !sixRolled; attempt += 1) {
      const state = baseState(seed);
      result = new RollAiPurchaseChartCommand('p1', purchaseChart).execute(state);
      const event = result.events[0];
      if (event && event.type === 'AiPurchaseChartRolled' && event.roll === 6) {
        sixRolled = true;
      } else {
        seed += 1;
      }
    }

    expect(sixRolled).toBe(true);
    const event = result?.events[0];
    if (!event || event.type !== 'AiPurchaseChartRolled') {
      throw new Error('Expected an AiPurchaseChartRolled event with roll 6');
    }
    expect(event.specialRoll).not.toBeNull();
    expect(event.specialRoll).toBeGreaterThanOrEqual(1);
    expect(event.specialRoll).toBeLessThanOrEqual(purchaseChart.specialUnitOptions.length);
    expect(event.unitIds.length).toBe(1);
    expect(purchaseChart.specialUnitOptions).toContain(event.unitIds[0]);
  });

  it('never touches player treasury or reserve — purchasing is a separate command', () => {
    const state = baseState(1);
    const result = new RollAiPurchaseChartCommand('p1', purchaseChart).execute(state);
    expect(result.state.players).toEqual(state.players);
  });
});
