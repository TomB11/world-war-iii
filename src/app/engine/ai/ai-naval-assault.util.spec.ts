import { pickNavalAssaultPlan } from './ai-naval-assault.util';
import { RulesEngine } from '../rules-engine';
import { region, testState, unitDef, unitInstance } from '../test-fixtures';
import { UnitDefinition } from '../../models/unit.model';
import { SeaZone } from '../../models/sea-zone.model';

describe('pickNavalAssaultPlan', () => {
  const rules = new RulesEngine();
  const catalog: Readonly<Record<string, UnitDefinition>> = {
    infantry: unitDef({ id: 'infantry', category: 'land', attack: 1, defense: 2, movement: 1 }),
    'stealth-boat': unitDef({
      id: 'stealth-boat',
      category: 'naval',
      attack: 3,
      defense: 3,
      movement: 2,
      transportCapacity: 2,
      transportLandCapacity: 1,
      transportAirCapacity: 1,
    }),
  };

  function seaZone(overrides: Partial<SeaZone> & { id: string }): SeaZone {
    return { label: overrides.id, position: { x: 0, y: 0 }, neighbors: [], adjacentRegionIds: [], ...overrides };
  }

  it('returns null when the player has no eligible passenger units', () => {
    const state = testState({ phase: 'attackMoves', activePlayerId: 'p1', regions: {}, seaZones: {}, units: [] });
    expect(pickNavalAssaultPlan(state, 'p1', catalog, rules)).toBeNull();
  });

  it('returns null when a passenger exists but no transport is in boarding range', () => {
    const state = testState({
      phase: 'attackMoves',
      activePlayerId: 'p1',
      regions: { coast: region({ id: 'coast', ownerId: 'p1' }) },
      seaZones: {},
      units: [unitInstance({ id: 'inf', unitId: 'infantry', ownerId: 'p1', regionId: 'coast', movesRemaining: 1 })],
    });
    expect(pickNavalAssaultPlan(state, 'p1', catalog, rules)).toBeNull();
  });

  it('plans an immediate unload (0 hops) when the transport already sits adjacent to a hostile coast', () => {
    const state = testState({
      phase: 'attackMoves',
      activePlayerId: 'p1',
      regions: {
        coast: region({ id: 'coast', ownerId: 'p1' }),
        'enemy-coast': region({ id: 'enemy-coast', ownerId: 'enemy', value: 3 }),
      },
      seaZones: {
        'sea-1': seaZone({ id: 'sea-1', adjacentRegionIds: ['coast', 'enemy-coast'] }),
      },
      units: [
        unitInstance({ id: 'inf', unitId: 'infantry', ownerId: 'p1', regionId: 'coast', movesRemaining: 1 }),
        unitInstance({ id: 'boat', unitId: 'stealth-boat', ownerId: 'p1', regionId: 'sea-1', movesRemaining: 2 }),
      ],
    });

    const plan = pickNavalAssaultPlan(state, 'p1', catalog, rules);
    expect(plan).toEqual({
      passengerUnitId: 'inf',
      transportUnitId: 'boat',
      sailToSeaZoneId: 'sea-1',
      targetRegionId: 'enemy-coast',
    });
  });

  it('sails the transport to a reachable sea zone bordering a hostile coast when not already adjacent', () => {
    const state = testState({
      phase: 'attackMoves',
      activePlayerId: 'p1',
      regions: {
        coast: region({ id: 'coast', ownerId: 'p1' }),
        'enemy-coast': region({ id: 'enemy-coast', ownerId: 'enemy', value: 3 }),
      },
      seaZones: {
        'sea-1': seaZone({ id: 'sea-1', neighbors: ['sea-2'], adjacentRegionIds: ['coast'] }),
        'sea-2': seaZone({ id: 'sea-2', neighbors: ['sea-1'], adjacentRegionIds: ['enemy-coast'] }),
      },
      units: [
        unitInstance({ id: 'inf', unitId: 'infantry', ownerId: 'p1', regionId: 'coast', movesRemaining: 1 }),
        unitInstance({ id: 'boat', unitId: 'stealth-boat', ownerId: 'p1', regionId: 'sea-1', movesRemaining: 2 }),
      ],
    });

    const plan = pickNavalAssaultPlan(state, 'p1', catalog, rules);
    expect(plan?.sailToSeaZoneId).toBe('sea-2');
    expect(plan?.targetRegionId).toBe('enemy-coast');
  });

  it('returns null when no reachable sea zone borders a hostile coast', () => {
    const state = testState({
      phase: 'attackMoves',
      activePlayerId: 'p1',
      regions: {
        coast: region({ id: 'coast', ownerId: 'p1' }),
        'friendly-coast': region({ id: 'friendly-coast', ownerId: 'p1' }),
      },
      seaZones: {
        'sea-1': seaZone({ id: 'sea-1', adjacentRegionIds: ['coast', 'friendly-coast'] }),
      },
      units: [
        unitInstance({ id: 'inf', unitId: 'infantry', ownerId: 'p1', regionId: 'coast', movesRemaining: 1 }),
        unitInstance({ id: 'boat', unitId: 'stealth-boat', ownerId: 'p1', regionId: 'sea-1', movesRemaining: 2 }),
      ],
    });

    expect(pickNavalAssaultPlan(state, 'p1', catalog, rules)).toBeNull();
  });
});
