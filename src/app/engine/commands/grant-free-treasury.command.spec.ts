import { GrantFreeTreasuryCommand } from './grant-free-treasury.command';
import { player, testState } from '../test-fixtures';

describe('GrantFreeTreasuryCommand', () => {
  it('credits the player treasury with no cost', () => {
    const state = testState({ players: [player({ id: 'p1', treasury: 5 })] });
    const result = new GrantFreeTreasuryCommand('p1', 2, 'Threat Track').execute(state);
    expect(result.state.players.find((p) => p.id === 'p1')?.treasury).toBe(7);
    expect(result.events).toEqual([{ type: 'TreasuryGranted', playerId: 'p1', amount: 2, reason: 'Threat Track' }]);
  });

  it('is a no-op for an unknown player', () => {
    const state = testState({ players: [player({ id: 'p1', treasury: 5 })] });
    const result = new GrantFreeTreasuryCommand('unknown', 2, 'Threat Track').execute(state);
    expect(result.events).toEqual([]);
    expect(result.state).toBe(state);
  });

  it('is a no-op when the amount is zero', () => {
    const state = testState({ players: [player({ id: 'p1', treasury: 5 })] });
    const result = new GrantFreeTreasuryCommand('p1', 0, 'Threat Track').execute(state);
    expect(result.events).toEqual([]);
    expect(result.state).toBe(state);
  });
});
