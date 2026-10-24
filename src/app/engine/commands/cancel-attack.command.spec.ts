import { AttackCommand } from './attack.command';
import { CancelAttackCommand } from './cancel-attack.command';
import { UnitDefinition } from '../../models/unit.model';
import { GameState } from '../../models/game-state.model';
import { must, player, region, testState, TEST_ECONOMY_CONFIG, unitDef, unitInstance } from '../test-fixtures';

describe('CancelAttackCommand', () => {
  const catalog: Readonly<Record<string, UnitDefinition>> = {
    infantry: unitDef({ id: 'infantry', category: 'land', attack: 1, movement: 2 }),
    'rocket-system': unitDef({ id: 'rocket-system', category: 'land', attack: 0, movement: 1, canDeclareMissile: true }),
    'missile-a': unitDef({ id: 'missile-a', category: 'missile', attack: 2, movement: 0 }),
  };

  function baseState(overrides: Partial<GameState> = {}): GameState {
    return testState({
      phase: 'attackMoves',
      activePlayerId: 'attacker',
      players: [
        player({ id: 'attacker', citizenSatisfaction: 50, reserve: [{ unitId: 'missile-a', quantity: 1 }] }),
        player({ id: 'defender', citizenSatisfaction: 50 }),
      ],
      regions: {
        home: region({ id: 'home', ownerId: 'attacker', neighbors: ['front', 'empty'] }),
        front: region({ id: 'front', ownerId: 'defender', neighbors: ['home'] }),
        empty: region({ id: 'empty', ownerId: 'defender', neighbors: ['home'] }),
      },
      units: [
        unitInstance({ id: 'atk-1', unitId: 'infantry', ownerId: 'attacker', regionId: 'home', movesRemaining: 2 }),
        unitInstance({ id: 'launcher-1', unitId: 'rocket-system', ownerId: 'attacker', regionId: 'home' }),
        unitInstance({ id: 'def-1', unitId: 'infantry', ownerId: 'defender', regionId: 'front' }),
      ],
      ...overrides,
    });
  }

  function attack(state: GameState, unitId: string, target: string): GameState {
    return new AttackCommand('attacker', unitId, target, catalog, TEST_ECONOMY_CONFIG, {}).execute(state).state;
  }

  function cancel(state: GameState, unitId: string) {
    return new CancelAttackCommand('attacker', unitId, TEST_ECONOMY_CONFIG).execute(state);
  }

  it('sends a unit back to where it came from with its movement and fought flag restored', () => {
    const attacked = attack(baseState(), 'atk-1', 'front');
    expect(attacked.attackRecords.length).toBe(1);
    expect(must(attacked.units.find((u) => u.id === 'atk-1'), 'unit').regionId).toBe('front');

    const result = cancel(attacked, 'atk-1');
    const unit = must(result.state.units.find((u) => u.id === 'atk-1'), 'unit');
    expect(unit.regionId).toBe('home');
    expect(unit.movesRemaining).toBe(2);
    expect(unit.hasFoughtThisTurn).toBe(false);
    expect(result.state.attackRecords).toEqual([]);
    expect(result.events[0]?.type).toBe('AttackCancelled');
  });

  it('gives a captured region back and reverses the Citizen Satisfaction penalties', () => {
    const attacked = attack(baseState({ units: [
      unitInstance({ id: 'atk-1', unitId: 'infantry', ownerId: 'attacker', regionId: 'home', movesRemaining: 2 }),
    ] }), 'atk-1', 'front');
    expect(attacked.regions['front'].ownerId).toBe('attacker');
    expect(must(attacked.players.find((p) => p.id === 'attacker'), 'attacker').citizenSatisfaction).toBe(45);

    const result = cancel(attacked, 'atk-1');
    expect(result.state.regions['front'].ownerId).toBe('defender');
    expect(result.state.regions['front'].capturedOnTurn).toBeUndefined();
    expect(must(result.state.players.find((p) => p.id === 'attacker'), 'attacker').citizenSatisfaction).toBe(50);
    expect(must(result.state.players.find((p) => p.id === 'defender'), 'defender').citizenSatisfaction).toBe(50);
  });

  it('refuses to cancel a capture once other units of the player stand in the captured region', () => {
    let state = baseState({ units: [
      unitInstance({ id: 'atk-1', unitId: 'infantry', ownerId: 'attacker', regionId: 'home', movesRemaining: 2 }),
    ] });
    state = attack(state, 'atk-1', 'front');
    state = {
      ...state,
      units: [...state.units, unitInstance({ id: 'friend', unitId: 'infantry', ownerId: 'attacker', regionId: 'front' })],
    };

    const result = cancel(state, 'atk-1');
    expect(result.events[0]?.type).toBe('MovementRejected');
    expect(result.state).toBe(state);
  });

  it('withdraws a declared missile strike and frees the Rocket System', () => {
    let state = attack(baseState(), 'atk-1', 'front');
    state = attack(state, 'launcher-1', 'front');
    expect(state.missileDeclarations['front']).toBe('launcher-1');

    const result = cancel(state, 'launcher-1');
    expect(result.state.missileDeclarations['front']).toBeUndefined();
    expect(must(result.state.units.find((u) => u.id === 'launcher-1'), 'launcher').hasFoughtThisTurn).toBe(false);
  });

  it('will not pull the last attacker out from under a declared missile strike', () => {
    let state = attack(baseState(), 'atk-1', 'front');
    state = attack(state, 'launcher-1', 'front');

    const result = cancel(state, 'atk-1');
    expect(result.events[0]?.type).toBe('MovementRejected');
  });

  it('rejects cancelling outside the Attack Moves phase', () => {
    const attacked = attack(baseState(), 'atk-1', 'front');
    const result = cancel({ ...attacked, phase: 'attack' }, 'atk-1');
    expect(result.events[0]?.type).toBe('MovementRejected');
  });
});
