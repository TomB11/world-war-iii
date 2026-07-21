import { RulesEngine } from './rules-engine';
import { region, unitDef, unitInstance, testState } from './test-fixtures';
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
