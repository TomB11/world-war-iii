import { UnloadUnitCommand } from './unload-unit.command';
import { UnitDefinition } from '../../models/unit.model';
import { player, region, testState, TEST_ECONOMY_CONFIG, unitDef, unitInstance } from '../test-fixtures';

describe('UnloadUnitCommand', () => {
  const catalog: Readonly<Record<string, UnitDefinition>> = {
    infantry: unitDef({ id: 'infantry', category: 'land', attack: 1, movement: 2 }),
  };

  it('stamps capturedOnTurn on an undefended amphibious-assault capture (PROJECT_RULES.md sections 18/30), same as any other capture', () => {
    const state = testState({
      phase: 'attackMoves',
      activePlayerId: 'attacker',
      turnNumber: 6,
      players: [player({ id: 'attacker' }), player({ id: 'defender' })],
      regions: { coast: region({ id: 'coast', ownerId: 'defender', neighbors: [] }) },
      seaZones: {
        'sea-1': { id: 'sea-1', label: '1', position: { x: 0, y: 0 }, neighbors: [], adjacentRegionIds: ['coast'] },
      },
      units: [
        unitInstance({
          id: 'cargo-1',
          unitId: 'infantry',
          ownerId: 'attacker',
          regionId: 'sea-1',
          transportedBy: 'ship-1',
          movesRemaining: 1,
        }),
      ],
    });

    const result = new UnloadUnitCommand('attacker', 'cargo-1', 'coast', catalog, TEST_ECONOMY_CONFIG, {}).execute(state);

    expect(result.state.regions['coast'].ownerId).toBe('attacker');
    expect(result.state.regions['coast'].capturedOnTurn).toBe(6);
    const cargo = result.state.units.find((u) => u.id === 'cargo-1');
    expect(cargo?.transportedBy).toBeNull();
    expect(cargo?.regionId).toBe('coast');
    expect(cargo?.movesRemaining).toBe(0);
  });
});
