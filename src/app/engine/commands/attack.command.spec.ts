import { AttackCommand } from './attack.command';
import { UnitDefinition } from '../../models/unit.model';
import { player, region, testState, TEST_ECONOMY_CONFIG, unitDef, unitInstance } from '../test-fixtures';

describe('AttackCommand — Rocket System missile declaration (PROJECT_RULES.md section 15)', () => {
  const catalog: Readonly<Record<string, UnitDefinition>> = {
    infantry: unitDef({ id: 'infantry', category: 'land', attack: 1, movement: 1 }),
    'rocket-system': unitDef({ id: 'rocket-system', category: 'land', attack: 0, movement: 1, canDeclareMissile: true }),
    'missile-a': unitDef({ id: 'missile-a', category: 'missile', attack: 2, movement: 0 }),
    'missile-b': unitDef({ id: 'missile-b', category: 'missile', attack: 4, movement: 0, missileRange: 2 }),
  };

  function run(overrides: Parameters<typeof testState>[0], unitInstanceId: string, targetRegionId: string) {
    const state = testState({
      phase: 'attackMoves',
      activePlayerId: 'attacker',
      players: [player({ id: 'attacker' }), player({ id: 'defender' })],
      ...overrides,
    });
    const command = new AttackCommand('attacker', unitInstanceId, targetRegionId, catalog, TEST_ECONOMY_CONFIG);
    return { state, result: command.execute(state) };
  }

  it('rejects a Rocket System declaring on a defended region its own side is not already attacking', () => {
    const { result } = run(
      {
        regions: {
          home: region({ id: 'home', ownerId: 'attacker', neighbors: ['front'] }),
          front: region({ id: 'front', ownerId: 'defender', neighbors: ['home'] }),
        },
        units: [
          unitInstance({ id: 'launcher-1', unitId: 'rocket-system', ownerId: 'attacker', regionId: 'home' }),
          unitInstance({ id: 'def-1', unitId: 'infantry', ownerId: 'defender', regionId: 'front' }),
        ],
      },
      'launcher-1',
      'front',
    );

    expect(result.events).toEqual([
      {
        type: 'MovementRejected',
        playerId: 'attacker',
        reason: 'A Rocket System can only support an attack your own units have already opened on that region',
      },
    ]);
    expect(result.state.missileDeclarations['front']).toBeUndefined();
  });

  it('rejects a Rocket System declaring a strike when its Reserve holds no missiles', () => {
    const { result } = run(
      {
        regions: {
          home: region({ id: 'home', ownerId: 'attacker', neighbors: ['front'] }),
          front: region({ id: 'front', ownerId: 'defender', neighbors: ['home'] }),
        },
        units: [
          unitInstance({ id: 'launcher-1', unitId: 'rocket-system', ownerId: 'attacker', regionId: 'home' }),
          unitInstance({ id: 'atk-1', unitId: 'infantry', ownerId: 'attacker', regionId: 'front' }),
          unitInstance({ id: 'def-1', unitId: 'infantry', ownerId: 'defender', regionId: 'front' }),
        ],
      },
      'launcher-1',
      'front',
    );

    expect(result.events).toEqual([
      {
        type: 'MovementRejected',
        playerId: 'attacker',
        reason: 'You have no missiles in Reserve to fire — purchase one before declaring a strike',
      },
    ]);
    expect(result.state.missileDeclarations['front']).toBeUndefined();
  });

  it('declares a supporting missile strike without moving the launcher, once own units are already attacking that region and Reserve holds a missile', () => {
    const { result } = run(
      {
        players: [
          player({ id: 'attacker', reserve: [{ unitId: 'missile-a', quantity: 1 }] }),
          player({ id: 'defender' }),
        ],
        regions: {
          home: region({ id: 'home', ownerId: 'attacker', neighbors: ['front'] }),
          front: region({ id: 'front', ownerId: 'defender', neighbors: ['home'] }),
        },
        units: [
          unitInstance({ id: 'launcher-1', unitId: 'rocket-system', ownerId: 'attacker', regionId: 'home' }),
          unitInstance({ id: 'atk-1', unitId: 'infantry', ownerId: 'attacker', regionId: 'front' }),
          unitInstance({ id: 'def-1', unitId: 'infantry', ownerId: 'defender', regionId: 'front' }),
        ],
      },
      'launcher-1',
      'front',
    );

    expect(result.events).toEqual([
      { type: 'MissileStrikeDeclared', playerId: 'attacker', regionId: 'front', unitInstanceId: 'launcher-1' },
    ]);
    expect(result.state.missileDeclarations['front']).toBe('launcher-1');

    const launcher = result.state.units.find((u) => u.id === 'launcher-1');
    expect(launcher?.regionId).toBe('home');
    expect(launcher?.hasFoughtThisTurn).toBe(true);
  });

  it('rejects a 2-hop declaration when Reserve only holds a Missile A (1-hop range)', () => {
    const { result } = run(
      {
        players: [
          player({ id: 'attacker', reserve: [{ unitId: 'missile-a', quantity: 1 }] }),
          player({ id: 'defender' }),
        ],
        regions: {
          home: region({ id: 'home', ownerId: 'attacker', neighbors: ['mid'] }),
          mid: region({ id: 'mid', ownerId: 'attacker', neighbors: ['home', 'far'] }),
          far: region({ id: 'far', ownerId: 'defender', neighbors: ['mid'] }),
        },
        units: [
          unitInstance({ id: 'launcher-1', unitId: 'rocket-system', ownerId: 'attacker', regionId: 'home' }),
          unitInstance({ id: 'atk-1', unitId: 'infantry', ownerId: 'attacker', regionId: 'far' }),
          unitInstance({ id: 'def-1', unitId: 'infantry', ownerId: 'defender', regionId: 'far' }),
        ],
      },
      'launcher-1',
      'far',
    );

    expect(result.events).toEqual([
      {
        type: 'MovementRejected',
        playerId: 'attacker',
        reason: '"far" is not a legal attack target for this unit',
      },
    ]);
    expect(result.state.missileDeclarations['far']).toBeUndefined();
  });

  it('extends declare range to 2 hops when Reserve holds a Missile B (PROJECT_RULES.md section 16)', () => {
    const { result } = run(
      {
        players: [
          player({ id: 'attacker', reserve: [{ unitId: 'missile-b', quantity: 1 }] }),
          player({ id: 'defender' }),
        ],
        regions: {
          home: region({ id: 'home', ownerId: 'attacker', neighbors: ['mid'] }),
          mid: region({ id: 'mid', ownerId: 'attacker', neighbors: ['home', 'far'] }),
          far: region({ id: 'far', ownerId: 'defender', neighbors: ['mid'] }),
        },
        units: [
          unitInstance({ id: 'launcher-1', unitId: 'rocket-system', ownerId: 'attacker', regionId: 'home' }),
          unitInstance({ id: 'atk-1', unitId: 'infantry', ownerId: 'attacker', regionId: 'far' }),
          unitInstance({ id: 'def-1', unitId: 'infantry', ownerId: 'defender', regionId: 'far' }),
        ],
      },
      'launcher-1',
      'far',
    );

    expect(result.events).toEqual([
      { type: 'MissileStrikeDeclared', playerId: 'attacker', regionId: 'far', unitInstanceId: 'launcher-1' },
    ]);
    expect(result.state.missileDeclarations['far']).toBe('launcher-1');

    const launcher = result.state.units.find((u) => u.id === 'launcher-1');
    expect(launcher?.regionId).toBe('home');
  });

  it('rejects a second declaration by the same launcher once it has already fought this turn', () => {
    const { result } = run(
      {
        regions: {
          home: region({ id: 'home', ownerId: 'attacker', neighbors: ['front'] }),
          front: region({ id: 'front', ownerId: 'defender', neighbors: ['home'] }),
        },
        units: [
          unitInstance({ id: 'launcher-1', unitId: 'rocket-system', ownerId: 'attacker', regionId: 'home', hasFoughtThisTurn: true }),
          unitInstance({ id: 'atk-1', unitId: 'infantry', ownerId: 'attacker', regionId: 'front' }),
          unitInstance({ id: 'def-1', unitId: 'infantry', ownerId: 'defender', regionId: 'front' }),
        ],
      },
      'launcher-1',
      'front',
    );

    expect(result.events).toEqual([
      { type: 'MovementRejected', playerId: 'attacker', reason: 'This unit has already attacked this turn' },
    ]);
  });
});
