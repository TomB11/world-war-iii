import { chooseTacticalDestination, pickMostThreatenedDestination } from './ai-tactical-move.util';
import { RulesEngine } from '../rules-engine';
import { region, testState, unitDef, unitInstance } from '../test-fixtures';
import { UnitDefinition } from '../../models/unit.model';

describe('chooseTacticalDestination', () => {
  const rules = new RulesEngine();
  const catalog: Readonly<Record<string, UnitDefinition>> = {
    infantry: unitDef({ id: 'infantry', movement: 1 }),
  };

  it('returns null when the unit has no reachable destinations at all', () => {
    const state = testState({
      phase: 'tacticalMoves',
      activePlayerId: 'p1',
      regions: { home: region({ id: 'home', ownerId: 'p1', neighbors: [] }) },
    });
    const unit = unitInstance({ id: 'u1', unitId: 'infantry', ownerId: 'p1', regionId: 'home', movesRemaining: 1 });

    expect(chooseTacticalDestination(state, unit, catalog, rules)).toBeNull();
  });

  it('moves toward the reachable region with more hostile neighbors (the frontline)', () => {
    const state = testState({
      phase: 'tacticalMoves',
      activePlayerId: 'p1',
      regions: {
        home: region({ id: 'home', ownerId: 'p1', neighbors: ['interior', 'frontier'] }),
        interior: region({ id: 'interior', ownerId: 'p1', neighbors: ['home'] }),
        frontier: region({ id: 'frontier', ownerId: 'p1', neighbors: ['home', 'enemy-region'] }),
        'enemy-region': region({ id: 'enemy-region', ownerId: 'enemy', neighbors: ['frontier'] }),
      },
    });
    const unit = unitInstance({ id: 'u1', unitId: 'infantry', ownerId: 'p1', regionId: 'home', movesRemaining: 1 });

    expect(chooseTacticalDestination(state, unit, catalog, rules)).toBe('frontier');
  });

  it('returns null when nothing reachable improves on the unit\'s current frontline exposure', () => {
    const state = testState({
      phase: 'tacticalMoves',
      activePlayerId: 'p1',
      regions: {
        home: region({ id: 'home', ownerId: 'p1', neighbors: ['frontier'] }),
        frontier: region({ id: 'frontier', ownerId: 'p1', neighbors: ['home', 'enemy-region'] }),
        'enemy-region': region({ id: 'enemy-region', ownerId: 'enemy', neighbors: ['frontier'] }),
      },
    });
    // Already standing at the frontline itself — its only reachable move (home) is strictly worse.
    const unit = unitInstance({ id: 'u1', unitId: 'infantry', ownerId: 'p1', regionId: 'frontier', movesRemaining: 1 });

    expect(chooseTacticalDestination(state, unit, catalog, rules)).toBeNull();
  });
});

describe('pickMostThreatenedDestination', () => {
  const rules = new RulesEngine();

  it('returns null when there are no destinations', () => {
    const state = testState({ regions: {} });
    expect(pickMostThreatenedDestination(state, 'p1', [], rules)).toBeNull();
  });

  it('picks the destination with the most non-owned neighbors (Fortress doctrine special)', () => {
    const state = testState({
      regions: {
        quiet: region({ id: 'quiet', ownerId: 'p1', neighbors: ['p1-owned'] }),
        'p1-owned': region({ id: 'p1-owned', ownerId: 'p1', neighbors: ['quiet'] }),
        frontline: region({ id: 'frontline', ownerId: 'p1', neighbors: ['enemy-a', 'enemy-b'] }),
        'enemy-a': region({ id: 'enemy-a', ownerId: 'enemy', neighbors: ['frontline'] }),
        'enemy-b': region({ id: 'enemy-b', ownerId: 'enemy', neighbors: ['frontline'] }),
      },
    });
    expect(pickMostThreatenedDestination(state, 'p1', ['quiet', 'frontline'], rules)).toBe('frontline');
  });

  it('falls back to the first destination when all are tied', () => {
    const state = testState({
      regions: {
        a: region({ id: 'a', ownerId: 'p1', neighbors: [] }),
        b: region({ id: 'b', ownerId: 'p1', neighbors: [] }),
      },
    });
    expect(pickMostThreatenedDestination(state, 'p1', ['a', 'b'], rules)).toBe('a');
  });
});
