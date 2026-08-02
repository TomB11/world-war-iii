import { RollAiCyberActionCommand } from './roll-ai-cyber-action.command';
import { AiCyberActionTableData } from '../../models/ai-cyber-action.model';
import { player, testState } from '../test-fixtures';

describe('RollAiCyberActionCommand', () => {
  const cyberActionTable: AiCyberActionTableData = {
    table: { '1': 'none', '2': 'none', '3': 'hack', '4': 'hack', '5': 'influence', '6': 'sabotage' },
  };

  it('is a no-op outside the Cyber Attack phase', () => {
    const state = testState({ phase: 'buyUnits', activePlayerId: 'p1', players: [player({ id: 'p1' })] });
    const result = new RollAiCyberActionCommand('p1', cyberActionTable).execute(state);
    expect(result.events).toEqual([]);
    expect(result.state).toBe(state);
  });

  it("is a no-op when it is not this player's turn", () => {
    const state = testState({ phase: 'cyberAttack', activePlayerId: 'p1', players: [player({ id: 'p1' })] });
    const result = new RollAiCyberActionCommand('p2', cyberActionTable).execute(state);
    expect(result.events).toEqual([]);
    expect(result.state).toBe(state);
  });

  it('rolls 1d6 and resolves to the matching table action, advancing the seed', () => {
    const state = testState({
      phase: 'cyberAttack',
      activePlayerId: 'p1',
      players: [player({ id: 'p1' })],
      randomSeed: 1,
    });
    const result = new RollAiCyberActionCommand('p1', cyberActionTable).execute(state);

    expect(result.events.length).toBe(1);
    const event = result.events[0];
    if (event.type !== 'AiCyberActionRolled') {
      throw new Error('Expected an AiCyberActionRolled event');
    }
    expect(event.playerId).toBe('p1');
    expect(event.action).toBe(cyberActionTable.table[String(event.roll)]);
    expect(result.state.randomSeed).not.toBe(state.randomSeed);
  });
});
