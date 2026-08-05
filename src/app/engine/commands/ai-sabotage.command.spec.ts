import { AiSabotageCommand } from './ai-sabotage.command';
import { AiSabotageEffectsData } from '../../models/ai-sabotage.model';
import { GameState } from '../../models/game-state.model';
import { faction, player, region, testState, TEST_ECONOMY_CONFIG } from '../test-fixtures';

describe('AiSabotageCommand', () => {
  const sabotageEffects: AiSabotageEffectsData = {
    effects: { '1': 'moneyLoss', '2': 'moneyLoss', '3': 'spawnBlock', '4': 'spawnBlock', '5': 'satisfactionDrop', '6': 'satisfactionDrop' },
    moneyLossAmount: 3,
    satisfactionDropAmount: 1,
  };

  function baseState(overrides: Partial<GameState> = {}) {
    return testState({
      phase: 'cyberAttack',
      activePlayerId: 'p1',
      players: [player({ id: 'p1' }), player({ id: 'p2', treasury: 10, citizenSatisfaction: 50 })],
      regions: { 'enemy-region': region({ id: 'enemy-region', ownerId: 'p2', value: 5 }) },
      randomSeed: 1,
      ...overrides,
    });
  }

  it('is a no-op outside the Cyber Attack phase', () => {
    const state = baseState({ phase: 'buyUnits' });
    const result = new AiSabotageCommand('p1', 'p2', 'enemy-region', TEST_ECONOMY_CONFIG, sabotageEffects, {}).execute(state);
    expect(result.events).toEqual([{ type: 'CyberAttackRejected', playerId: 'p1', reason: 'Sabotage is only allowed during the Cyber Attack Phase' }]);
    expect(result.state).toBe(state);
  });

  it("rejects when it is not this player's turn", () => {
    const state = baseState({ activePlayerId: 'other' });
    const result = new AiSabotageCommand('p1', 'p2', 'enemy-region', TEST_ECONOMY_CONFIG, sabotageEffects, {}).execute(state);
    expect(result.events[0]?.type).toBe('CyberAttackRejected');
  });

  it('rejects sabotaging yourself', () => {
    const state = baseState();
    const result = new AiSabotageCommand('p1', 'p1', 'enemy-region', TEST_ECONOMY_CONFIG, sabotageEffects, {}).execute(state);
    expect(result.events).toEqual([{ type: 'CyberAttackRejected', playerId: 'p1', reason: 'You cannot sabotage yourself' }]);
  });

  it('rejects sabotaging a teammate (PROJECT_RULES.md section 2 — sabotage is an attack)', () => {
    const state = baseState();
    const factions = {
      p1: faction({ id: 'p1', teamId: 'team-east' }),
      p2: faction({ id: 'p2', teamId: 'team-east' }),
    };
    const result = new AiSabotageCommand('p1', 'p2', 'enemy-region', TEST_ECONOMY_CONFIG, sabotageEffects, factions).execute(state);
    expect(result.events).toEqual([{ type: 'CyberAttackRejected', playerId: 'p1', reason: 'You cannot sabotage a teammate (PROJECT_RULES.md section 2)' }]);
  });

  it('rejects when the attacker already used their Cyber Attack action this turn', () => {
    const state = baseState({ players: [player({ id: 'p1', hasUsedCyberAttackThisTurn: true }), player({ id: 'p2', treasury: 10 })] });
    const result = new AiSabotageCommand('p1', 'p2', 'enemy-region', TEST_ECONOMY_CONFIG, sabotageEffects, {}).execute(state);
    expect(result.events[0]?.type).toBe('CyberAttackRejected');
  });

  it('sets hasUsedCyberAttackThisTurn on the attacker regardless of which effect fires', () => {
    const state = baseState();
    const result = new AiSabotageCommand('p1', 'p2', 'enemy-region', TEST_ECONOMY_CONFIG, sabotageEffects, {}).execute(state);
    expect(result.state.players.find((p) => p.id === 'p1')?.hasUsedCyberAttackThisTurn).toBe(true);
  });

  it('advances the random seed and emits AiSabotageResolved with a valid effect', () => {
    const state = baseState();
    const result = new AiSabotageCommand('p1', 'p2', 'enemy-region', TEST_ECONOMY_CONFIG, sabotageEffects, {}).execute(state);
    expect(result.state.randomSeed).not.toBe(state.randomSeed);
    const event = result.events[0];
    if (event?.type !== 'AiSabotageResolved') {
      throw new Error('Expected an AiSabotageResolved event');
    }
    expect(['moneyLoss', 'spawnBlock', 'satisfactionDrop']).toContain(event.effect);
    expect(event.targetPlayerId).toBe('p2');
    expect(event.targetRegionId).toBe('enemy-region');
  });

  it('spawnBlock effect adds the target region to sabotagedRegionIds', () => {
    const state = baseState({ randomSeed: 1 });
    // Seed sweep to force the spawnBlock outcome (rolls 3-4) deterministically.
    let seed = 1;
    let result;
    for (let attempt = 0; attempt < 200; attempt += 1) {
      result = new AiSabotageCommand('p1', 'p2', 'enemy-region', TEST_ECONOMY_CONFIG, sabotageEffects, {}).execute(baseState({ randomSeed: seed }));
      const event = result.events[0];
      if (event?.type === 'AiSabotageResolved' && event.effect === 'spawnBlock') {
        break;
      }
      seed += 1;
    }
    expect(result?.state.sabotagedRegionIds).toContain('enemy-region');
  });

  it('moneyLoss effect reduces target treasury by moneyLossAmount', () => {
    let seed = 1;
    let result;
    for (let attempt = 0; attempt < 200; attempt += 1) {
      result = new AiSabotageCommand('p1', 'p2', 'enemy-region', TEST_ECONOMY_CONFIG, sabotageEffects, {}).execute(baseState({ randomSeed: seed }));
      const event = result.events[0];
      if (event?.type === 'AiSabotageResolved' && event.effect === 'moneyLoss') {
        break;
      }
      seed += 1;
    }
    expect(result?.state.players.find((p) => p.id === 'p2')?.treasury).toBe(10 - sabotageEffects.moneyLossAmount);
  });
});
