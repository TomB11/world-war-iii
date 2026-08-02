import { RollAiOrderCommand } from './roll-ai-order.command';
import { AiOrderTableData } from '../../models/ai-order.model';
import { player, testState } from '../test-fixtures';

describe('RollAiOrderCommand', () => {
  const orderTable: AiOrderTableData = {
    table: {
      '1': 'attackNearest',
      '2': 'attackRichestAdjacent',
      '3': 'attackWeakestAdjacent',
      '4': 'reinforceThreatened',
      '5': 'pressureNeutral',
      '6': 'doctrineSpecial',
    },
  };

  it('is a no-op outside the Buy Units phase', () => {
    const state = testState({ phase: 'attackMoves', activePlayerId: 'p1', players: [player({ id: 'p1' })] });
    const result = new RollAiOrderCommand('p1', orderTable).execute(state);
    expect(result.events).toEqual([]);
    expect(result.state).toBe(state);
  });

  it("is a no-op when it is not this player's turn", () => {
    const state = testState({ phase: 'buyUnits', activePlayerId: 'p1', players: [player({ id: 'p1' })] });
    const result = new RollAiOrderCommand('p2', orderTable).execute(state);
    expect(result.events).toEqual([]);
    expect(result.state).toBe(state);
  });

  it('rolls 1d6 and resolves to a valid table action, advancing the seed', () => {
    const state = testState({
      phase: 'buyUnits',
      activePlayerId: 'p1',
      players: [player({ id: 'p1' })],
      randomSeed: 1,
    });
    const result = new RollAiOrderCommand('p1', orderTable).execute(state);

    expect(result.events.length).toBe(1);
    const event = result.events[0];
    if (event.type !== 'AiOrderRolled') {
      throw new Error('Expected an AiOrderRolled event');
    }
    expect(event.playerId).toBe('p1');
    expect(event.roll).toBeGreaterThanOrEqual(1);
    expect(event.roll).toBeLessThanOrEqual(6);
    expect(event.action).toBe(orderTable.table[String(event.roll)]);
    expect(result.state.randomSeed).not.toBe(state.randomSeed);
  });

  it('never touches players or units — this command only decides the order, nothing else', () => {
    const state = testState({
      phase: 'buyUnits',
      activePlayerId: 'p1',
      players: [player({ id: 'p1' })],
      randomSeed: 1,
    });
    const result = new RollAiOrderCommand('p1', orderTable).execute(state);
    expect(result.state.players).toEqual(state.players);
    expect(result.state.units).toEqual(state.units);
  });
});
