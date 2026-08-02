import { FireMissileCommand } from './fire-missile.command';
import { RegionCombat } from '../../models/region-combat.model';
import { UnitDefinition } from '../../models/unit.model';
import { player, region, testState, unitDef, unitInstance } from '../test-fixtures';

describe('FireMissileCommand — MissileFired event (map projectile animation)', () => {
  const catalog: Readonly<Record<string, UnitDefinition>> = {
    infantry: unitDef({ id: 'infantry', category: 'land', attack: 1, defense: 2, movement: 1 }),
    'missile-a': unitDef({ id: 'missile-a', category: 'missile', attack: 2, movement: 0 }),
    'rocket-system': unitDef({ id: 'rocket-system', category: 'land', attack: 0, movement: 1, canDeclareMissile: true }),
  };

  function baseCombat(overrides: Partial<RegionCombat> = {}): RegionCombat {
    return {
      regionId: 'front',
      round: 1,
      step: 'missileRoll',
      pendingDefenderCasualties: 0,
      pendingAttackerCasualties: 0,
      lastAttackerRolls: [],
      lastDefenderRolls: [],
      attackerCasualties: [],
      defenderCasualties: [],
      armedMissileUnitId: 'missile-a',
      missileResult: null,
      ...overrides,
    };
  }

  it('emits MissileFired with the launcher region alongside CombatRoundRolled', () => {
    const state = testState({
      phase: 'attack',
      activePlayerId: 'attacker',
      regions: {
        home: region({ id: 'home', ownerId: 'attacker', neighbors: ['front'] }),
        front: region({ id: 'front', ownerId: 'defender', neighbors: ['home'] }),
      },
      players: [
        player({ id: 'attacker', reserve: [{ unitId: 'missile-a', quantity: 1 }] }),
        player({ id: 'defender' }),
      ],
      units: [
        unitInstance({ id: 'launcher-1', unitId: 'rocket-system', ownerId: 'attacker', regionId: 'home' }),
        unitInstance({ id: 'atk-1', unitId: 'infantry', ownerId: 'attacker', regionId: 'front' }),
        unitInstance({ id: 'def-1', unitId: 'infantry', ownerId: 'defender', regionId: 'front' }),
      ],
      combats: { front: baseCombat() },
      missileDeclarations: { front: 'launcher-1' },
    });

    const result = new FireMissileCommand('attacker', 'front', catalog).execute(state);

    expect(result.events).toEqual(
      jasmine.arrayContaining([
        { type: 'CombatRoundRolled', regionId: 'front' },
        { type: 'MissileFired', regionId: 'front', launcherRegionId: 'home' },
      ]),
    );
  });

  it('omits MissileFired (but still resolves normally) if the launcher can no longer be found', () => {
    const state = testState({
      phase: 'attack',
      activePlayerId: 'attacker',
      regions: {
        front: region({ id: 'front', ownerId: 'defender', neighbors: [] }),
      },
      players: [
        player({ id: 'attacker', reserve: [{ unitId: 'missile-a', quantity: 1 }] }),
        player({ id: 'defender' }),
      ],
      units: [
        unitInstance({ id: 'atk-1', unitId: 'infantry', ownerId: 'attacker', regionId: 'front' }),
        unitInstance({ id: 'def-1', unitId: 'infantry', ownerId: 'defender', regionId: 'front' }),
      ],
      combats: { front: baseCombat() },
      missileDeclarations: {},
    });

    const result = new FireMissileCommand('attacker', 'front', catalog).execute(state);

    expect(result.events.some((e) => e.type === 'MissileFired')).toBe(false);
    expect(result.events.some((e) => e.type === 'CombatRoundRolled')).toBe(true);
  });
});
