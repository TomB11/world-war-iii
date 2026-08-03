import { HackCommand } from './hack.command';
import { faction, player, testState, TEST_ECONOMY_CONFIG } from '../test-fixtures';

describe('HackCommand', () => {
  function baseState() {
    return testState({
      phase: 'cyberAttack',
      activePlayerId: 'p1',
      players: [player({ id: 'p1', treasury: 10 }), player({ id: 'p2', treasury: 10, hackLevel: 2 })],
      randomSeed: 1,
    });
  }

  it('is a no-op outside the Cyber Attack phase', () => {
    const state = testState({ ...baseState(), phase: 'buyUnits' });
    const result = new HackCommand('p1', 'p2', TEST_ECONOMY_CONFIG, {}).execute(state);
    expect(result.events).toEqual([
      { type: 'CyberAttackRejected', playerId: 'p1', reason: 'Hacking is only allowed during the Cyber Attack Phase' },
    ]);
  });

  it('rejects hacking yourself', () => {
    const result = new HackCommand('p1', 'p1', TEST_ECONOMY_CONFIG, {}).execute(baseState());
    expect(result.events).toEqual([{ type: 'CyberAttackRejected', playerId: 'p1', reason: 'You cannot hack yourself' }]);
  });

  it('rejects hacking a teammate (PROJECT_RULES.md section 2 — hacking is an attack)', () => {
    const factions = {
      p1: faction({ id: 'p1', teamId: 'team-east' }),
      p2: faction({ id: 'p2', teamId: 'team-east' }),
    };
    const result = new HackCommand('p1', 'p2', TEST_ECONOMY_CONFIG, factions).execute(baseState());
    expect(result.events).toEqual([
      { type: 'CyberAttackRejected', playerId: 'p1', reason: 'You cannot hack a teammate (PROJECT_RULES.md section 2)' },
    ]);
  });

  it('allows hacking a rival (different team) and emits HackResolved', () => {
    const factions = {
      p1: faction({ id: 'p1', teamId: 'team-east' }),
      p2: faction({ id: 'p2', teamId: 'team-west' }),
    };
    const result = new HackCommand('p1', 'p2', TEST_ECONOMY_CONFIG, factions).execute(baseState());
    expect(result.events[0]?.type).toBe('HackResolved');
    expect(result.state.players.find((p) => p.id === 'p1')?.hasUsedCyberAttackThisTurn).toBe(true);
  });
});
