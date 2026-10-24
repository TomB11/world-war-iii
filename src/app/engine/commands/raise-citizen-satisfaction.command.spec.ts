import { RaiseCitizenSatisfactionCommand } from './raise-citizen-satisfaction.command';
import { must, player, testState, TEST_ECONOMY_CONFIG } from '../test-fixtures';

describe('RaiseCitizenSatisfactionCommand', () => {
  function stateFor(citizenSatisfaction: number, treasury: number) {
    return testState({
      phase: 'buyUnits',
      players: [player({ id: 'p1', citizenSatisfaction, treasury })],
    });
  }

  it('spends 1 money per point of Citizen Satisfaction', () => {
    const result = new RaiseCitizenSatisfactionCommand('p1', 10, TEST_ECONOMY_CONFIG).execute(stateFor(50, 25));
    const p1 = must(result.state.players[0], 'expected p1');
    expect(p1.citizenSatisfaction).toBe(60);
    expect(p1.treasury).toBe(15);
  });

  it('only charges for the points that fit under the track maximum', () => {
    const result = new RaiseCitizenSatisfactionCommand('p1', 10, TEST_ECONOMY_CONFIG).execute(stateFor(78, 25));
    const p1 = must(result.state.players[0], 'expected p1');
    expect(p1.citizenSatisfaction).toBe(80);
    expect(p1.treasury).toBe(23);
  });

  it('rejects spending when the marker is already at the maximum', () => {
    const state = stateFor(80, 25);
    const result = new RaiseCitizenSatisfactionCommand('p1', 5, TEST_ECONOMY_CONFIG).execute(state);
    expect(result.state).toBe(state);
    expect(result.events[0]?.type).toBe('PublicSpendingRejected');
  });

  it('rejects fractional amounts and amounts the treasury cannot cover', () => {
    const state = stateFor(50, 3);
    expect(new RaiseCitizenSatisfactionCommand('p1', 1.5, TEST_ECONOMY_CONFIG).execute(state).events[0]?.type).toBe(
      'PublicSpendingRejected',
    );
    expect(new RaiseCitizenSatisfactionCommand('p1', 5, TEST_ECONOMY_CONFIG).execute(state).events[0]?.type).toBe(
      'PublicSpendingRejected',
    );
  });
});
