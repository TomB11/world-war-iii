import { AttackCommand } from './attack.command';
import { UnitDefinition } from '../../models/unit.model';
import { player, region, testState, TEST_ECONOMY_CONFIG, unitDef, unitInstance } from '../test-fixtures';

describe('AttackCommand — Rocket System missile declaration (PROJECT_RULES.md section 15)', () => {
  const catalog: Readonly<Record<string, UnitDefinition>> = {
    infantry: unitDef({ id: 'infantry', category: 'land', attack: 1, movement: 1 }),
    'rocket-system': unitDef({ id: 'rocket-system', category: 'land', attack: 0, movement: 1, canDeclareMissile: true }),
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

  it('declares a supporting missile strike without moving the launcher, once own units are already attacking that region', () => {
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
      { type: 'MissileStrikeDeclared', playerId: 'attacker', regionId: 'front', unitInstanceId: 'launcher-1' },
    ]);
    expect(result.state.missileDeclarations['front']).toBe('launcher-1');

    const launcher = result.state.units.find((u) => u.id === 'launcher-1');
    expect(launcher?.regionId).toBe('home');
    expect(launcher?.hasFoughtThisTurn).toBe(true);
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
