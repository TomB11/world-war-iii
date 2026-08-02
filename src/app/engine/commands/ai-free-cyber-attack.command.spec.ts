import { AiFreeCyberAttackCommand } from './ai-free-cyber-attack.command';
import { player, testState } from '../test-fixtures';

describe('AiFreeCyberAttackCommand', () => {
  it('is a no-op targeting yourself', () => {
    const state = testState({ players: [player({ id: 'p1' })] });
    const result = new AiFreeCyberAttackCommand('p1', 'p1').execute(state);
    expect(result.events).toEqual([]);
    expect(result.state).toBe(state);
  });

  it('is a no-op for an unknown target', () => {
    const state = testState({ players: [player({ id: 'p1' })] });
    const result = new AiFreeCyberAttackCommand('p1', 'unknown').execute(state);
    expect(result.events).toEqual([]);
    expect(result.state).toBe(state);
  });

  it('never charges the attacker (no cost, unlike HackCommand) and never sets hasUsedCyberAttackThisTurn', () => {
    const state = testState({
      randomSeed: 1,
      players: [player({ id: 'p1', treasury: 10 }), player({ id: 'p2', treasury: 10, hackLevel: 6 })],
    });
    const result = new AiFreeCyberAttackCommand('p1', 'p2').execute(state);
    const attacker = result.state.players.find((p) => p.id === 'p1');
    expect(attacker?.hasUsedCyberAttackThisTurn).toBe(false);
    // hackLevel 6 guarantees a hit on any d6 roll, so the attacker's treasury only ever increases (never decreases, since there's no cost).
    expect(attacker?.treasury).toBeGreaterThanOrEqual(10);
  });

  it('transfers money from target to attacker on a successful hack (guaranteed hit via hackLevel 6)', () => {
    const state = testState({
      randomSeed: 1,
      players: [player({ id: 'p1', treasury: 0 }), player({ id: 'p2', treasury: 10, hackLevel: 6 })],
    });
    const result = new AiFreeCyberAttackCommand('p1', 'p2').execute(state);
    const attacker = result.state.players.find((p) => p.id === 'p1');
    const target = result.state.players.find((p) => p.id === 'p2');
    expect(attacker?.treasury).toBeGreaterThan(0);
    expect(target?.treasury).toBeLessThan(10);
    expect(attacker?.treasury).toBe(10 - (target?.treasury ?? 0));
  });

  it('advances the random seed', () => {
    const state = testState({
      randomSeed: 1,
      players: [player({ id: 'p1' }), player({ id: 'p2', hackLevel: 6 })],
    });
    const result = new AiFreeCyberAttackCommand('p1', 'p2').execute(state);
    expect(result.state.randomSeed).not.toBe(state.randomSeed);
  });
});
