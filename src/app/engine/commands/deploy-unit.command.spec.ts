import { DeployUnitCommand } from './deploy-unit.command';
import { RemoveCasualtyCommand } from './remove-casualty.command';
import { RegionCombat } from '../../models/region-combat.model';
import { UnitDefinition } from '../../models/unit.model';
import { player, region, testState, TEST_ECONOMY_CONFIG, unitDef, unitInstance } from '../test-fixtures';

describe('DeployUnitCommand', () => {
  const catalog: Readonly<Record<string, UnitDefinition>> = {
    infantry: unitDef({ id: 'infantry', movement: 1 }),
    'missile-a': unitDef({ id: 'missile-a', category: 'missile', movement: 0 }),
    destroyer: unitDef({ id: 'destroyer', category: 'naval', movement: 2 }),
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
      armedMissileUnitId: null,
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

  it('rejects deploying a missile — it has no physical presence and stays in Reserve until fired (PROJECT_RULES.md section 15)', () => {
    const state = testState({
      phase: 'placeNewUnits',
      activePlayerId: 'p1',
      regions: { factory: region({ id: 'factory', ownerId: 'p1', factory: 1 }) },
      players: [player({ id: 'p1', reserve: [{ unitId: 'missile-a', quantity: 1 }] })],
    });

    const command = new DeployUnitCommand('p1', 'missile-a', 'factory', catalog);
    const result = command.execute(state);

    expect(result.events).toEqual([
      {
        type: 'MovementRejected',
        playerId: 'p1',
        reason:
          'Missiles are never deployed to the map — they stay in Reserve until a Rocket System fires one (PROJECT_RULES.md section 15)',
      },
    ]);
    expect(result.state.units).toEqual([]);
    expect(result.state.players[0].reserve).toEqual([{ unitId: 'missile-a', quantity: 1 }]);
  });

  it('rejects deploying at a region captured this very turn — it must be held through a full round first (PROJECT_RULES.md section 18)', () => {
    const state = testState({
      phase: 'placeNewUnits',
      activePlayerId: 'p1',
      turnNumber: 3,
      regions: { factory: region({ id: 'factory', ownerId: 'p1', factory: 1, capturedOnTurn: 3 }) },
      players: [player({ id: 'p1', reserve: [{ unitId: 'infantry', quantity: 1 }] })],
    });

    const result = new DeployUnitCommand('p1', 'infantry', 'factory', catalog).execute(state);

    expect(result.events).toEqual([
      {
        type: 'MovementRejected',
        playerId: 'p1',
        reason: 'factory was just captured — it must be held for a full turn before it can produce units',
      },
    ]);
    expect(result.state.units).toEqual([]);
  });

  it('allows deploying at a region captured on an earlier turn (held through a full round)', () => {
    const state = testState({
      phase: 'placeNewUnits',
      activePlayerId: 'p1',
      turnNumber: 3,
      regions: { factory: region({ id: 'factory', ownerId: 'p1', factory: 1, capturedOnTurn: 2 }) },
      players: [player({ id: 'p1', reserve: [{ unitId: 'infantry', quantity: 1 }] })],
    });

    const result = new DeployUnitCommand('p1', 'infantry', 'factory', catalog).execute(state);

    expect(result.state.units.length).toBe(1);
  });

  it("rejects a second deploy this turn once a region's factory capacity is used up (PROJECT_RULES.md section 18)", () => {
    let state = testState({
      phase: 'placeNewUnits',
      activePlayerId: 'p1',
      regions: { factory: region({ id: 'factory', ownerId: 'p1', factory: 1 }) },
      players: [player({ id: 'p1', reserve: [{ unitId: 'infantry', quantity: 2 }] })],
    });

    const first = new DeployUnitCommand('p1', 'infantry', 'factory', catalog).execute(state);
    expect(first.state.units.length).toBe(1);
    expect(first.state.unitsDeployedThisTurn).toEqual({ factory: 1 });
    state = first.state;

    const second = new DeployUnitCommand('p1', 'infantry', 'factory', catalog).execute(state);

    expect(second.events).toEqual([
      {
        type: 'MovementRejected',
        playerId: 'p1',
        reason: "factory's factory can only produce 1 unit(s) per turn",
      },
    ]);
    expect(second.state.units.length).toBe(1);
  });

  it('rejects a naval deploy when every adjacent factory region was captured this turn', () => {
    const state = testState({
      phase: 'placeNewUnits',
      activePlayerId: 'p1',
      turnNumber: 3,
      regions: { coast: region({ id: 'coast', ownerId: 'p1', factory: 1, capturedOnTurn: 3, neighbors: [] }) },
      seaZones: {
        'sea-1': { id: 'sea-1', label: '1', position: { x: 0, y: 0 }, neighbors: [], adjacentRegionIds: ['coast'] },
      },
      players: [player({ id: 'p1', reserve: [{ unitId: 'destroyer', quantity: 1 }] })],
    });

    const result = new DeployUnitCommand('p1', 'destroyer', 'sea-1', catalog).execute(state);

    expect(result.events).toEqual([
      {
        type: 'MovementRejected',
        playerId: 'p1',
        reason:
          'You may only deploy naval units to a sea zone adjacent to a factory region you control that you have held since before this turn',
      },
    ]);
    expect(result.state.units).toEqual([]);
  });

  it('picks whichever adjacent factory region still has capacity for a naval deploy, and counts the deploy against it', () => {
    const state = testState({
      phase: 'placeNewUnits',
      activePlayerId: 'p1',
      regions: {
        exhausted: region({ id: 'exhausted', ownerId: 'p1', factory: 1, neighbors: [] }),
        fresh: region({ id: 'fresh', ownerId: 'p1', factory: 1, neighbors: [] }),
      },
      seaZones: {
        'sea-1': {
          id: 'sea-1',
          label: '1',
          position: { x: 0, y: 0 },
          neighbors: [],
          adjacentRegionIds: ['exhausted', 'fresh'],
        },
      },
      players: [player({ id: 'p1', reserve: [{ unitId: 'destroyer', quantity: 1 }] })],
      unitsDeployedThisTurn: { exhausted: 1 },
    });

    const result = new DeployUnitCommand('p1', 'destroyer', 'sea-1', catalog).execute(state);

    expect(result.state.units.length).toBe(1);
    expect(result.state.unitsDeployedThisTurn).toEqual({ exhausted: 1, fresh: 1 });
  });
});
