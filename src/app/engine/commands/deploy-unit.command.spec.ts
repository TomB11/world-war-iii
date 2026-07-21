import { DeployUnitCommand } from './deploy-unit.command';
import { RemoveCasualtyCommand } from './remove-casualty.command';
import { RegionCombat } from '../../models/region-combat.model';
import { UnitDefinition } from '../../models/unit.model';
import { player, region, testState, TEST_ECONOMY_CONFIG, unitDef, unitInstance } from '../test-fixtures';

describe('DeployUnitCommand', () => {
  const catalog: Readonly<Record<string, UnitDefinition>> = {
    infantry: unitDef({ id: 'infantry', movement: 1 }),
  };

  function baseCombat(overrides: Partial<RegionCombat> = {}): RegionCombat {
    return {
      regionId: 'front',
      round: 1,
      step: 'defenderCasualty',
      pendingDefenderCasualties: 1,
      pendingAttackerCasualties: 0,
      lastAttackerRolls: [],
      lastDefenderRolls: [],
      attackerCasualties: [],
      defenderCasualties: [],
      missileResult: null,
      ...overrides,
    };
  }

  it('mints unit ids from the persistent counter, not from units.length', () => {
    const state = testState({
      phase: 'placeNewUnits',
      activePlayerId: 'p1',
      regions: { factory: region({ id: 'factory', ownerId: 'p1', factory: 1 }) },
      players: [player({ id: 'p1', reserve: [{ unitId: 'infantry', quantity: 1 }] })],
      nextUnitInstanceId: 7,
    });

    const command = new DeployUnitCommand('p1', 'infantry', 'factory', catalog);
    const result = command.execute(state);

    const deployedEvent = result.events.find((e) => e.type === 'UnitDeployed');
    if (deployedEvent === undefined || deployedEvent.type !== 'UnitDeployed') {
      throw new Error('Expected a UnitDeployed event');
    }
    expect(deployedEvent.unitInstanceId).toBe('unit-7');
    expect(result.state.nextUnitInstanceId).toBe(8);
  });

  it('never reuses the id of a unit still alive after earlier casualties shrank units.length (regression)', () => {
    // Reproduces the original bug: with 3 units on the map, a length-based id
    // scheme mints "unit-4" for a new deploy. If a casualty is removed first
    // (units.length drops from 3 to 2), the SAME scheme would then mint
    // "unit-3" again for a second deploy — colliding with the survivor
    // already holding that id. The persistent nextUnitInstanceId counter
    // must keep issuing fresh ids regardless of how many units have died.
    let state = testState({
      phase: 'attack',
      activePlayerId: 'attacker',
      regions: {
        front: region({ id: 'front', ownerId: 'defender' }),
        factory: region({ id: 'factory', ownerId: 'attacker', factory: 1 }),
      },
      players: [
        player({ id: 'attacker', reserve: [{ unitId: 'infantry', quantity: 2 }] }),
        player({ id: 'defender' }),
      ],
      units: [
        unitInstance({ id: 'unit-1', unitId: 'infantry', ownerId: 'attacker', regionId: 'front' }),
        unitInstance({ id: 'unit-2', unitId: 'infantry', ownerId: 'attacker', regionId: 'front' }),
        unitInstance({ id: 'unit-3', unitId: 'infantry', ownerId: 'defender', regionId: 'front' }),
      ],
      combats: { front: baseCombat() },
      nextUnitInstanceId: 4,
    });

    // The defender's sole unit ("unit-3") dies, shrinking state.units from 3 to 2.
    const casualtyResult = new RemoveCasualtyCommand('attacker', 'front', 'unit-3', TEST_ECONOMY_CONFIG).execute(state);
    state = { ...casualtyResult.state, phase: 'placeNewUnits' };
    expect(state.units.map((u) => u.id)).toEqual(['unit-1', 'unit-2']);

    // Deploying a new unit must NOT mint "unit-3" again.
    const deployResult = new DeployUnitCommand('attacker', 'infantry', 'factory', catalog).execute(state);
    const newIds = deployResult.state.units.map((u) => u.id);

    expect(newIds).toContain('unit-4');
    expect(new Set(newIds).size).toBe(newIds.length);
  });
});
