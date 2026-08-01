import { MoveUnitCommand } from './move-unit.command';
import { UnitDefinition } from '../../models/unit.model';
import { player, region, testState, unitDef, unitInstance } from '../test-fixtures';

describe('MoveUnitCommand', () => {
  const catalog: Readonly<Record<string, UnitDefinition>> = {
    infantry: unitDef({ id: 'infantry', category: 'land', movement: 2 }),
    destroyer: unitDef({ id: 'destroyer', category: 'naval', movement: 2 }),
  };

  it('rejects a land unit plain-moving during Attack Moves — that phase is attack-only for land/air (PROJECT_RULES.md section 7)', () => {
    const state = testState({
      phase: 'attackMoves',
      activePlayerId: 'p1',
      regions: {
        home: region({ id: 'home', ownerId: 'p1', neighbors: ['friendly'] }),
        friendly: region({ id: 'friendly', ownerId: 'p1', neighbors: ['home'] }),
      },
      units: [unitInstance({ id: 'inf-1', unitId: 'infantry', ownerId: 'p1', regionId: 'home', movesRemaining: 2 })],
    });

    const result = new MoveUnitCommand('p1', 'inf-1', 'friendly', catalog).execute(state);

    expect(result.events).toEqual([
      {
        type: 'MovementRejected',
        playerId: 'p1',
        reason:
          'Plain moves are only allowed during the Tactical Moves phase (naval units may also reposition through sea zones during Attack Moves)',
      },
    ]);
    expect(result.state.units[0].regionId).toBe('home');
  });

  it('lets a naval unit sail through sea zones during Attack Moves (PROJECT_RULES.md sections 7/30), consuming its own movement', () => {
    const state = testState({
      phase: 'attackMoves',
      activePlayerId: 'p1',
      seaZones: {
        'sea-1': { id: 'sea-1', label: '1', position: { x: 0, y: 0 }, neighbors: ['sea-2'], adjacentRegionIds: [] },
        'sea-2': { id: 'sea-2', label: '2', position: { x: 0, y: 0 }, neighbors: ['sea-1'], adjacentRegionIds: [] },
      },
      units: [
        unitInstance({ id: 'ship-1', unitId: 'destroyer', ownerId: 'p1', regionId: 'sea-1', movesRemaining: 2 }),
      ],
    });

    const result = new MoveUnitCommand('p1', 'ship-1', 'sea-2', catalog).execute(state);

    expect(result.events).toEqual([{ type: 'UnitMoved', unitInstanceId: 'ship-1', fromRegionId: 'sea-1', toRegionId: 'sea-2' }]);
    const ship = result.state.units.find((u) => u.id === 'ship-1');
    expect(ship?.regionId).toBe('sea-2');
    expect(ship?.movesRemaining).toBe(1);
  });

  it('brings embarked cargo along for the ride without spending the cargo\'s own movement', () => {
    const state = testState({
      phase: 'attackMoves',
      activePlayerId: 'p1',
      seaZones: {
        'sea-1': { id: 'sea-1', label: '1', position: { x: 0, y: 0 }, neighbors: ['sea-2'], adjacentRegionIds: [] },
        'sea-2': { id: 'sea-2', label: '2', position: { x: 0, y: 0 }, neighbors: ['sea-1'], adjacentRegionIds: [] },
      },
      units: [
        unitInstance({ id: 'ship-1', unitId: 'destroyer', ownerId: 'p1', regionId: 'sea-1', movesRemaining: 1 }),
        unitInstance({
          id: 'cargo-1',
          unitId: 'infantry',
          ownerId: 'p1',
          regionId: 'sea-1',
          transportedBy: 'ship-1',
          movesRemaining: 2,
        }),
      ],
    });

    const result = new MoveUnitCommand('p1', 'ship-1', 'sea-2', catalog).execute(state);

    const cargo = result.state.units.find((u) => u.id === 'cargo-1');
    expect(cargo?.regionId).toBe('sea-2');
    expect(cargo?.movesRemaining).toBe(2);
    expect(cargo?.transportedBy).toBe('ship-1');
  });

  it("still rejects a naval unit sailing beyond its movement allowance", () => {
    const state = testState({
      phase: 'attackMoves',
      activePlayerId: 'p1',
      seaZones: {
        'sea-1': { id: 'sea-1', label: '1', position: { x: 0, y: 0 }, neighbors: ['sea-2'], adjacentRegionIds: [] },
        'sea-2': { id: 'sea-2', label: '2', position: { x: 0, y: 0 }, neighbors: ['sea-1', 'sea-3'], adjacentRegionIds: [] },
        'sea-3': { id: 'sea-3', label: '3', position: { x: 0, y: 0 }, neighbors: ['sea-2'], adjacentRegionIds: [] },
      },
      units: [
        unitInstance({ id: 'ship-1', unitId: 'destroyer', ownerId: 'p1', regionId: 'sea-1', movesRemaining: 1 }),
      ],
    });

    const result = new MoveUnitCommand('p1', 'ship-1', 'sea-3', catalog).execute(state);

    expect(result.events).toEqual([
      { type: 'MovementRejected', playerId: 'p1', reason: '"sea-3" is not a legal destination for this unit' },
    ]);
  });

  it('also allows the same naval sea-zone repositioning during Tactical Moves (unchanged behavior)', () => {
    const state = testState({
      phase: 'tacticalMoves',
      activePlayerId: 'p1',
      seaZones: {
        'sea-1': { id: 'sea-1', label: '1', position: { x: 0, y: 0 }, neighbors: ['sea-2'], adjacentRegionIds: [] },
        'sea-2': { id: 'sea-2', label: '2', position: { x: 0, y: 0 }, neighbors: ['sea-1'], adjacentRegionIds: [] },
      },
      units: [
        unitInstance({ id: 'ship-1', unitId: 'destroyer', ownerId: 'p1', regionId: 'sea-1', movesRemaining: 2 }),
      ],
    });

    const result = new MoveUnitCommand('p1', 'ship-1', 'sea-2', catalog).execute(state);

    expect(result.state.units.find((u) => u.id === 'ship-1')?.regionId).toBe('sea-2');
  });
});
