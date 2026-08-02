import { GrantFreeUnitsCommand } from './grant-free-units.command';
import { player, testState } from '../test-fixtures';

describe('GrantFreeUnitsCommand', () => {
  it('adds units to Reserve with no cost', () => {
    const state = testState({ players: [player({ id: 'p1', reserve: [] })] });
    const result = new GrantFreeUnitsCommand('p1', 'infantry', 2).execute(state);
    expect(result.state.players.find((p) => p.id === 'p1')?.reserve).toEqual([{ unitId: 'infantry', quantity: 2 }]);
    expect(result.events).toEqual([{ type: 'FreeUnitsGranted', playerId: 'p1', unitId: 'infantry', quantity: 2 }]);
  });

  it('merges into an existing Reserve entry rather than duplicating it', () => {
    const state = testState({ players: [player({ id: 'p1', reserve: [{ unitId: 'infantry', quantity: 1 }] })] });
    const result = new GrantFreeUnitsCommand('p1', 'infantry', 2).execute(state);
    expect(result.state.players.find((p) => p.id === 'p1')?.reserve).toEqual([{ unitId: 'infantry', quantity: 3 }]);
  });

  it('is a no-op for an unknown player', () => {
    const state = testState({ players: [player({ id: 'p1' })] });
    const result = new GrantFreeUnitsCommand('unknown', 'infantry', 2).execute(state);
    expect(result.events).toEqual([]);
    expect(result.state).toBe(state);
  });

  it('is a no-op for a non-positive quantity', () => {
    const state = testState({ players: [player({ id: 'p1' })] });
    const result = new GrantFreeUnitsCommand('p1', 'infantry', 0).execute(state);
    expect(result.events).toEqual([]);
    expect(result.state).toBe(state);
  });
});
