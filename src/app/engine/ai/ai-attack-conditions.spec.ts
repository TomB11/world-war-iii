import { evaluateAttackConditions } from './ai-attack-conditions';
import { RulesEngine } from '../rules-engine';
import { region, testState, unitDef, unitInstance } from '../test-fixtures';
import { UnitDefinition } from '../../models/unit.model';
import { Faction } from '../../models/faction.model';
import { AiAttackConditionsData } from '../../models/ai-attack-conditions.model';

describe('evaluateAttackConditions', () => {
  const rules = new RulesEngine();
  const catalog: Readonly<Record<string, UnitDefinition>> = {
    infantry: unitDef({ id: 'infantry', attack: 1, defense: 2, movement: 1 }),
    tank: unitDef({ id: 'tank', attack: 3, defense: 3, movement: 2, aiAttackSupport: true }),
  };
  const conditionsData: AiAttackConditionsData = { numericalAdvantageDelta: 2, highValueThresholds: [5, 6] };
  const factions: Readonly<Record<string, Faction>> = {
    p1: { id: 'p1', name: 'P1', color: '#fff', capitalRegionId: 'capital-region', teamId: 'team-a' },
  };

  function baseState(targetOwnerId: string, targetValue: number, targetIsVictoryStar = false) {
    return testState({
      phase: 'attackMoves',
      activePlayerId: 'p1',
      regions: {
        target: region({ id: 'target', ownerId: targetOwnerId, value: targetValue, isVictoryStar: targetIsVictoryStar }),
      },
    });
  }

  it('is always true for an undefended target, regardless of other factors', () => {
    const state = baseState('enemy', 1);
    expect(evaluateAttackConditions(state, 'p1', 'target', [], catalog, factions, conditionsData, rules)).toBe(true);
  });

  it('is false against a defended target when no condition is met', () => {
    let state = baseState('enemy', 1);
    state = { ...state, units: [unitInstance({ id: 'd1', unitId: 'infantry', ownerId: 'enemy', regionId: 'target', movesRemaining: 1 })] };
    expect(evaluateAttackConditions(state, 'p1', 'target', ['a1'], catalog, factions, conditionsData, rules)).toBe(false);
  });

  it('is true when the committing force outnumbers defenders by the configured delta', () => {
    let state = baseState('enemy', 1);
    state = { ...state, units: [unitInstance({ id: 'd1', unitId: 'infantry', ownerId: 'enemy', regionId: 'target', movesRemaining: 1 })] };
    // 1 defender + delta(2) = 3 committing units needed.
    expect(evaluateAttackConditions(state, 'p1', 'target', ['a1', 'a2'], catalog, factions, conditionsData, rules)).toBe(false);
    expect(evaluateAttackConditions(state, 'p1', 'target', ['a1', 'a2', 'a3'], catalog, factions, conditionsData, rules)).toBe(true);
  });

  it('is true when a committing unit has tank/fighter support (aiAttackSupport)', () => {
    let state = baseState('enemy', 1);
    state = {
      ...state,
      units: [
        unitInstance({ id: 'd1', unitId: 'infantry', ownerId: 'enemy', regionId: 'target', movesRemaining: 1 }),
        unitInstance({ id: 'a1', unitId: 'tank', ownerId: 'p1', regionId: 'home', movesRemaining: 2 }),
      ],
    };
    expect(evaluateAttackConditions(state, 'p1', 'target', ['a1'], catalog, factions, conditionsData, rules)).toBe(true);
  });

  it('is true when the target region value is a configured high-value threshold', () => {
    let state = baseState('enemy', 6);
    state = { ...state, units: [unitInstance({ id: 'd1', unitId: 'infantry', ownerId: 'enemy', regionId: 'target', movesRemaining: 1 })] };
    expect(evaluateAttackConditions(state, 'p1', 'target', ['a1'], catalog, factions, conditionsData, rules)).toBe(true);
  });

  it('is true when the target is a faction capital', () => {
    let state = testState({
      phase: 'attackMoves',
      activePlayerId: 'p1',
      regions: { 'capital-region': region({ id: 'capital-region', ownerId: 'enemy', value: 1 }) },
    });
    state = {
      ...state,
      units: [unitInstance({ id: 'd1', unitId: 'infantry', ownerId: 'enemy', regionId: 'capital-region', movesRemaining: 1 })],
    };
    expect(evaluateAttackConditions(state, 'p1', 'capital-region', ['a1'], catalog, factions, conditionsData, rules)).toBe(true);
  });

  it('is true when the target is a white-star victory region', () => {
    let state = baseState('enemy', 1, true);
    state = { ...state, units: [unitInstance({ id: 'd1', unitId: 'infantry', ownerId: 'enemy', regionId: 'target', movesRemaining: 1 })] };
    expect(evaluateAttackConditions(state, 'p1', 'target', ['a1'], catalog, factions, conditionsData, rules)).toBe(true);
  });
});
