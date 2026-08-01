import { RulesEngine } from './rules-engine';
import { player, region, unitDef, unitInstance, testState } from './test-fixtures';
import { UnitDefinition } from '../models/unit.model';

describe('RulesEngine movement/attack reach (computeReach)', () => {
  const rules = new RulesEngine();

  const catalog: Readonly<Record<string, UnitDefinition>> = {
    infantry: unitDef({ id: 'infantry', category: 'land', movement: 2 }),
    fighter: unitDef({ id: 'fighter', category: 'air', movement: 3 }),
    destroyer: unitDef({ id: 'destroyer', category: 'naval', movement: 2 }),
  };

  it('reaches an empty friendly-adjacent region as a move, multi-hop up to movesRemaining', () => {
    const state = testState({
      regions: {
        a: region({ id: 'a', ownerId: 'p1', neighbors: ['b'] }),
        b: region({ id: 'b', ownerId: null, neighbors: ['a', 'c'] }),
        c: region({ id: 'c', ownerId: null, neighbors: ['b'] }),
      },
      units: [unitInstance({ id: 'u1', unitId: 'infantry', ownerId: 'p1', regionId: 'a', movesRemaining: 2 })],
    });
    const unit = state.units[0];

    const moves = rules.getReachableMoves(state, unit, catalog);

    expect(moves.get('b')).toBe(1);
    expect(moves.get('c')).toBe(2);
  });

  it('does not go beyond movesRemaining', () => {
    const state = testState({
      regions: {
        a: region({ id: 'a', ownerId: 'p1', neighbors: ['b'] }),
        b: region({ id: 'b', ownerId: null, neighbors: ['a', 'c'] }),
        c: region({ id: 'c', ownerId: null, neighbors: ['b'] }),
      },
      units: [unitInstance({ id: 'u1', unitId: 'infantry', ownerId: 'p1', regionId: 'a', movesRemaining: 1 })],
    });
    const unit = state.units[0];

    const moves = rules.getReachableMoves(state, unit, catalog);

    expect(moves.has('b')).toBe(true);
    expect(moves.has('c')).toBe(false);
  });

  it('lists an enemy-owned neighbor as an attack target, not a move', () => {
    const state = testState({
      regions: {
        a: region({ id: 'a', ownerId: 'p1', neighbors: ['b'] }),
        b: region({ id: 'b', ownerId: 'p2', neighbors: ['a'] }),
      },
      units: [unitInstance({ id: 'u1', unitId: 'infantry', ownerId: 'p1', regionId: 'a', movesRemaining: 1 })],
    });
    const unit = state.units[0];

    const moves = rules.getReachableMoves(state, unit, catalog);
    const attacks = rules.getReachableAttacks(state, unit, catalog);

    expect(moves.has('b')).toBe(false);
    expect(attacks.get('b')).toBe(1);
  });

  it('blocks a land unit from pathing through enemy-held territory to reach farther regions', () => {
    const state = testState({
      regions: {
        a: region({ id: 'a', ownerId: 'p1', neighbors: ['b'] }),
        b: region({ id: 'b', ownerId: 'p2', neighbors: ['a', 'c'] }),
        c: region({ id: 'c', ownerId: null, neighbors: ['b'] }),
      },
      units: [unitInstance({ id: 'u1', unitId: 'infantry', ownerId: 'p1', regionId: 'a', movesRemaining: 3 })],
    });
    const unit = state.units[0];

    const moves = rules.getReachableMoves(state, unit, catalog);
    const attacks = rules.getReachableAttacks(state, unit, catalog);

    expect(attacks.get('b')).toBe(1);
    expect(moves.has('c')).toBe(false);
    expect(attacks.has('c')).toBe(false);
  });

  it('an air unit ignores terrain ownership and reaches through enemy territory by hop count alone', () => {
    const state = testState({
      regions: {
        a: region({ id: 'a', ownerId: 'p1', neighbors: ['b'] }),
        b: region({ id: 'b', ownerId: 'p2', neighbors: ['a', 'c'] }),
        c: region({ id: 'c', ownerId: null, neighbors: ['b'] }),
      },
      units: [unitInstance({ id: 'u1', unitId: 'fighter', ownerId: 'p1', regionId: 'a', movesRemaining: 2 })],
    });
    const unit = state.units[0];

    const moves = rules.getReachableMoves(state, unit, catalog);

    expect(moves.get('c')).toBe(2);
  });

  it('a naval unit moves only through sea zones, following SeaZone.neighbors', () => {
    const state = testState({
      seaZones: {
        's1': { id: 's1', label: '1', position: { x: 0, y: 0 }, neighbors: ['s2'], adjacentRegionIds: [] },
        's2': { id: 's2', label: '2', position: { x: 0, y: 0 }, neighbors: ['s1'], adjacentRegionIds: [] },
      },
      units: [unitInstance({ id: 'u1', unitId: 'destroyer', ownerId: 'p1', regionId: 's1', movesRemaining: 1 })],
    });
    const unit = state.units[0];

    const moves = rules.getReachableMoves(state, unit, catalog);

    expect(moves.get('s2')).toBe(1);
  });

  it('lets a land unit cross a strait only when it owns both sides', () => {
    const withoutBothSides = testState({
      regions: {
        a: region({ id: 'a', ownerId: 'p1', neighbors: [] }),
        b: region({ id: 'b', ownerId: 'p2', neighbors: [] }),
      },
      straits: [{ id: 'strait-1', regionA: 'a', regionB: 'b' }],
      units: [unitInstance({ id: 'u1', unitId: 'infantry', ownerId: 'p1', regionId: 'a', movesRemaining: 1 })],
    });
    const withBothSides = testState({
      ...withoutBothSides,
      regions: {
        a: region({ id: 'a', ownerId: 'p1', neighbors: [] }),
        b: region({ id: 'b', ownerId: 'p1', neighbors: [] }),
      },
    });

    const blockedMoves = rules.getReachableMoves(withoutBothSides, withoutBothSides.units[0], catalog);
    const allowedMoves = rules.getReachableMoves(withBothSides, withBothSides.units[0], catalog);

    expect(blockedMoves.has('b')).toBe(false);
    expect(allowedMoves.get('b')).toBe(1);
  });

  it('treats a region defended by a neutral garrison as hostile (attack target, not a move)', () => {
    const state = testState({
      regions: {
        a: region({ id: 'a', ownerId: 'p1', neighbors: ['b'] }),
        b: region({ id: 'b', ownerId: null, neighbors: ['a'] }),
      },
      units: [
        unitInstance({ id: 'u1', unitId: 'infantry', ownerId: 'p1', regionId: 'a', movesRemaining: 1 }),
        unitInstance({ id: 'garrison-1', unitId: 'infantry', ownerId: 'neutral', regionId: 'b' }),
      ],
    });
    const unit = state.units[0];

    const moves = rules.getReachableMoves(state, unit, catalog);
    const attacks = rules.getReachableAttacks(state, unit, catalog);

    expect(moves.has('b')).toBe(false);
    expect(attacks.get('b')).toBe(1);
  });
});

describe('RulesEngine.hasPendingMissileStrike / createInitialCombat (PROJECT_RULES.md section 15)', () => {
  const rules = new RulesEngine();
  const catalog: Readonly<Record<string, UnitDefinition>> = {
    'missile-a': unitDef({ id: 'missile-a', category: 'missile' }),
  };

  it('is false with no declaration for the region', () => {
    const state = testState({ missileDeclarations: {} });
    expect(rules.hasPendingMissileStrike(state, 'front', 'p1', catalog)).toBe(false);
  });

  it('is false when declared but the player has no missile in Reserve', () => {
    const state = testState({
      missileDeclarations: { front: 'launcher-1' },
      units: [unitInstance({ id: 'launcher-1', unitId: 'rocket-system', ownerId: 'p1', regionId: 'home' })],
      players: [player({ id: 'p1' })],
    });
    expect(rules.hasPendingMissileStrike(state, 'front', 'p1', catalog)).toBe(false);
  });

  it('is true once declared by this player and their Reserve holds a missile', () => {
    const state = testState({
      missileDeclarations: { front: 'launcher-1' },
      units: [unitInstance({ id: 'launcher-1', unitId: 'rocket-system', ownerId: 'p1', regionId: 'home' })],
      players: [player({ id: 'p1', reserve: [{ unitId: 'missile-a', quantity: 1 }] })],
    });
    expect(rules.hasPendingMissileStrike(state, 'front', 'p1', catalog)).toBe(true);
    expect(rules.createInitialCombat(state, 'front', 'p1', catalog).step).toBe('missileChoice');
  });

  it('is false for a declaration owned by a different player', () => {
    const state = testState({
      missileDeclarations: { front: 'launcher-1' },
      units: [unitInstance({ id: 'launcher-1', unitId: 'rocket-system', ownerId: 'p2', regionId: 'home' })],
      players: [player({ id: 'p1', reserve: [{ unitId: 'missile-a', quantity: 1 }] })],
    });
    expect(rules.hasPendingMissileStrike(state, 'front', 'p1', catalog)).toBe(false);
  });
});

describe('RulesEngine.getMissileStrikeTargets / getLegalAttackTargets (PROJECT_RULES.md section 16 — Missile B range)', () => {
  const rules = new RulesEngine();
  const catalog: Readonly<Record<string, UnitDefinition>> = {
    infantry: unitDef({ id: 'infantry', category: 'land', attack: 1 }),
    'rocket-system': unitDef({ id: 'rocket-system', category: 'support', attack: 0, canDeclareMissile: true }),
    'missile-a': unitDef({ id: 'missile-a', category: 'missile' }),
    'missile-b': unitDef({ id: 'missile-b', category: 'missile', missileRange: 2 }),
  };

  function twoHopState(reserve: readonly { unitId: string; quantity: number }[]) {
    return testState({
      players: [player({ id: 'p1', reserve }), player({ id: 'p2' })],
      regions: {
        home: region({ id: 'home', ownerId: 'p1', neighbors: ['mid'] }),
        mid: region({ id: 'mid', ownerId: 'p1', neighbors: ['home', 'far'] }),
        far: region({ id: 'far', ownerId: 'p2', neighbors: ['mid'] }),
      },
      units: [
        unitInstance({ id: 'launcher-1', unitId: 'rocket-system', ownerId: 'p1', regionId: 'home' }),
        unitInstance({ id: 'def-1', unitId: 'infantry', ownerId: 'p2', regionId: 'far' }),
      ],
    });
  }

  it('only reaches 1 hop with an empty Reserve', () => {
    const state = twoHopState([]);
    const launcher = state.units[0];
    expect([...rules.getMissileStrikeTargets(state, launcher, catalog).keys()]).toEqual([]);
    expect(rules.getLegalAttackTargets(state, launcher, catalog)).toEqual([]);
  });

  it('only reaches 1 hop while holding just a Missile A', () => {
    const state = twoHopState([{ unitId: 'missile-a', quantity: 1 }]);
    const launcher = state.units[0];
    expect([...rules.getMissileStrikeTargets(state, launcher, catalog).keys()]).toEqual([]);
  });

  it('reaches the 2-hop hostile region while holding a Missile B', () => {
    const state = twoHopState([{ unitId: 'missile-b', quantity: 1 }]);
    const launcher = state.units[0];
    expect([...rules.getMissileStrikeTargets(state, launcher, catalog).keys()]).toEqual(['far']);
    expect(rules.getLegalAttackTargets(state, launcher, catalog)).toEqual(['far']);
  });

  it('leaves an ordinary (non-canDeclareMissile) unit on its normal movement-based reach, unaffected by missile logic', () => {
    const state = twoHopState([]);
    const infantryAttacker = unitInstance({ id: 'inf-1', unitId: 'infantry', ownerId: 'p1', regionId: 'mid', movesRemaining: 1 });
    // An ordinary unit at 'mid' (1 hop from 'far') reaches it via normal reach, missile range never enters into it.
    expect(rules.getLegalAttackTargets(state, infantryAttacker, catalog)).toEqual(['far']);
  });
});

describe('RulesEngine deploy destinations (PROJECT_RULES.md section 18)', () => {
  const rules = new RulesEngine();
  const catalog: Readonly<Record<string, UnitDefinition>> = {
    infantry: unitDef({ id: 'infantry', category: 'land' }),
    destroyer: unitDef({ id: 'destroyer', category: 'naval' }),
    'missile-a': unitDef({ id: 'missile-a', category: 'missile' }),
  };

  it('excludes a factory region the player does not own, has no factory, or captured this very turn', () => {
    const state = testState({
      turnNumber: 3,
      regions: {
        owned: region({ id: 'owned', ownerId: 'p1', factory: 2 }),
        enemy: region({ id: 'enemy', ownerId: 'p2', factory: 2 }),
        'no-factory': region({ id: 'no-factory', ownerId: 'p1', factory: 0 }),
        'just-captured': region({ id: 'just-captured', ownerId: 'p1', factory: 2, capturedOnTurn: 3 }),
      },
    });

    expect(rules.getDeployDestinations(state, 'p1', 'infantry', catalog)).toEqual(['owned']);
  });

  it('excludes a region once its factory capacity is used up this turn', () => {
    const state = testState({
      regions: { owned: region({ id: 'owned', ownerId: 'p1', factory: 1 }) },
      unitsDeployedThisTurn: { owned: 1 },
    });

    expect(rules.getDeployDestinations(state, 'p1', 'infantry', catalog)).toEqual([]);
  });

  it('returns adjacent sea zones (not the region itself) for a naval unit', () => {
    const state = testState({
      regions: { coast: region({ id: 'coast', ownerId: 'p1', factory: 1, neighbors: [] }) },
      seaZones: {
        'sea-1': { id: 'sea-1', label: '1', position: { x: 0, y: 0 }, neighbors: [], adjacentRegionIds: ['coast'] },
      },
    });

    expect(rules.getDeployDestinations(state, 'p1', 'destroyer', catalog)).toEqual(['sea-1']);
    // A land unit deploys directly at the region itself, not the sea zone.
    expect(rules.getDeployDestinations(state, 'p1', 'infantry', catalog)).toEqual(['coast']);
  });

  it('is always empty for a missile — it never has a physical presence on the map (PROJECT_RULES.md section 15)', () => {
    const state = testState({
      regions: { owned: region({ id: 'owned', ownerId: 'p1', factory: 2 }) },
    });

    expect(rules.getDeployDestinations(state, 'p1', 'missile-a', catalog)).toEqual([]);
  });
});
