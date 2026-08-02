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

describe('AttackCommand — undefended capture stamps capturedOnTurn (PROJECT_RULES.md section 18)', () => {
  const catalog: Readonly<Record<string, UnitDefinition>> = {
    tank: unitDef({ id: 'tank', category: 'land', attack: 3, movement: 2 }),
  };

  it('stamps the captured region with the current turn number, so it cannot produce units until held a full round', () => {
    const state = testState({
      phase: 'attackMoves',
      activePlayerId: 'attacker',
      turnNumber: 5,
      players: [player({ id: 'attacker' }), player({ id: 'defender' })],
      regions: {
        home: region({ id: 'home', ownerId: 'attacker', neighbors: ['front'] }),
        // Owned by an enemy but currently empty (its defenders already fell) — an undefended capture (attack.command.ts's own doc comment).
        front: region({ id: 'front', ownerId: 'defender', neighbors: ['home'] }),
      },
      units: [unitInstance({ id: 'atk-1', unitId: 'tank', ownerId: 'attacker', regionId: 'home' })],
    });

    const result = new AttackCommand('attacker', 'atk-1', 'front', catalog, TEST_ECONOMY_CONFIG).execute(state);

    const capturedFront = result.state.regions['front'];
    expect(capturedFront.ownerId).toBe('attacker');
    expect(capturedFront.capturedOnTurn).toBe(5);
  });
});

describe('AttackCommand — naval attacks (PROJECT_RULES.md section 30 extension: ship-to-ship combat)', () => {
  const catalog: Readonly<Record<string, UnitDefinition>> = {
    destroyer: unitDef({ id: 'destroyer', category: 'naval', attack: 5, defense: 4, movement: 2 }),
  };

  function seaZoneState(overrides: Parameters<typeof testState>[0] = {}) {
    return testState({
      phase: 'attackMoves',
      activePlayerId: 'attacker',
      players: [player({ id: 'attacker' }), player({ id: 'defender' })],
      regions: {},
      seaZones: {
        'sea-1': { id: 'sea-1', label: 'Sea 1', position: { x: 0, y: 0 }, neighbors: ['sea-2'], adjacentRegionIds: [] },
        'sea-2': { id: 'sea-2', label: 'Sea 2', position: { x: 0, y: 0 }, neighbors: ['sea-1'], adjacentRegionIds: [] },
      },
      ...overrides,
    });
  }

  it('a ship attacking an enemy-occupied sea zone contests it (co-locate), never captures — sea zones have no owner', () => {
    const state = seaZoneState({
      units: [
        unitInstance({ id: 'atk-ship', unitId: 'destroyer', ownerId: 'attacker', regionId: 'sea-1', movesRemaining: 2 }),
        unitInstance({ id: 'def-ship', unitId: 'destroyer', ownerId: 'defender', regionId: 'sea-2' }),
      ],
    });

    const result = new AttackCommand('attacker', 'atk-ship', 'sea-2', catalog, TEST_ECONOMY_CONFIG).execute(state);

    expect(result.events).toEqual([
      { type: 'RegionContested', playerId: 'attacker', regionId: 'sea-2' },
      { type: 'UnitMoved', unitInstanceId: 'atk-ship', fromRegionId: 'sea-1', toRegionId: 'sea-2' },
    ]);
    const attackerShip = result.state.units.find((u) => u.id === 'atk-ship');
    expect(attackerShip?.regionId).toBe('sea-2');
    expect(attackerShip?.hasFoughtThisTurn).toBe(true);
  });

  it('rejects attacking a sea zone with no hostile ship in it — never a legal attack target in the first place', () => {
    const state = seaZoneState({
      units: [unitInstance({ id: 'atk-ship', unitId: 'destroyer', ownerId: 'attacker', regionId: 'sea-1', movesRemaining: 2 })],
    });
    const result = new AttackCommand('attacker', 'atk-ship', 'sea-2', catalog, TEST_ECONOMY_CONFIG).execute(state);
    expect(result.events).toEqual([
      { type: 'MovementRejected', playerId: 'attacker', reason: '"sea-2" is not a legal attack target for this unit' },
    ]);
  });
});
