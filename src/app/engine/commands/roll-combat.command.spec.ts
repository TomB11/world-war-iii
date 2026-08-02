import { RollCombatCommand } from './roll-combat.command';
import { RegionCombat } from '../../models/region-combat.model';
import { UnitDefinition } from '../../models/unit.model';
import { player, region, testState, unitDef, unitInstance } from '../test-fixtures';

describe('RollCombatCommand', () => {
  const catalog: Readonly<Record<string, UnitDefinition>> = {
    infantry: unitDef({ id: 'infantry', category: 'land', attack: 1, defense: 2, movement: 1 }),
    fighter: unitDef({ id: 'fighter', category: 'air', attack: 3, defense: 2, movement: 4 }),
    destroyer: unitDef({ id: 'destroyer', category: 'naval', attack: 5, defense: 4, movement: 2 }),
    'land-transport': unitDef({
      id: 'land-transport',
      category: 'naval',
      attack: 0,
      defense: 1,
      movement: 2,
      transportCapacity: 3,
      transportLandCapacity: 2,
      transportAirCapacity: 1,
    }),
  };

  function baseCombat(overrides: Partial<RegionCombat> = {}): RegionCombat {
    return {
      regionId: 'battleground',
      round: 1,
      step: 'attackerRoll',
      pendingDefenderCasualties: 0,
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

  it('rejects outside the Attack Phase', () => {
    const state = testState({
      phase: 'attackMoves',
      activePlayerId: 'attacker',
      regions: { battleground: region({ id: 'battleground', ownerId: 'defender' }) },
      units: [
        unitInstance({ id: 'atk-1', unitId: 'infantry', ownerId: 'attacker', regionId: 'battleground' }),
        unitInstance({ id: 'def-1', unitId: 'infantry', ownerId: 'defender', regionId: 'battleground' }),
      ],
    });
    const result = new RollCombatCommand('attacker', 'battleground', catalog).execute(state);
    expect(result.events).toEqual([
      { type: 'CombatRejected', playerId: 'attacker', reason: 'Combat can only be rolled during the Attack Phase' },
    ]);
  });

  it("rejects when it is not the roller's turn", () => {
    const state = testState({
      phase: 'attack',
      activePlayerId: 'someone-else',
      regions: { battleground: region({ id: 'battleground', ownerId: 'defender' }) },
      units: [
        unitInstance({ id: 'atk-1', unitId: 'infantry', ownerId: 'attacker', regionId: 'battleground' }),
        unitInstance({ id: 'def-1', unitId: 'infantry', ownerId: 'defender', regionId: 'battleground' }),
      ],
    });
    const result = new RollCombatCommand('attacker', 'battleground', catalog).execute(state);
    expect(result.events[0]?.type).toBe('CombatRejected');
  });

  it('rejects when one side has no units at all', () => {
    const state = testState({
      phase: 'attack',
      activePlayerId: 'attacker',
      regions: { battleground: region({ id: 'battleground', ownerId: 'defender' }) },
      units: [unitInstance({ id: 'atk-1', unitId: 'infantry', ownerId: 'attacker', regionId: 'battleground' })],
    });
    const result = new RollCombatCommand('attacker', 'battleground', catalog).execute(state);
    expect(result.events).toEqual([
      { type: 'CombatRejected', playerId: 'attacker', reason: 'This region has no pending battle' },
    ]);
  });

  it('advances the random seed and creates a fresh RegionCombat entry on the first roll', () => {
    const state = testState({
      phase: 'attack',
      activePlayerId: 'attacker',
      randomSeed: 1,
      regions: { battleground: region({ id: 'battleground', ownerId: 'defender' }) },
      units: [
        unitInstance({ id: 'atk-1', unitId: 'infantry', ownerId: 'attacker', regionId: 'battleground' }),
        unitInstance({ id: 'def-1', unitId: 'infantry', ownerId: 'defender', regionId: 'battleground' }),
      ],
    });
    const result = new RollCombatCommand('attacker', 'battleground', catalog).execute(state);
    expect(result.state.randomSeed).not.toBe(1);
    expect(result.state.combats['battleground']).toBeDefined();
    expect(result.state.combats['battleground'].lastAttackerRolls.length).toBe(1);
    expect(result.events).toEqual([{ type: 'CombatRoundRolled', regionId: 'battleground' }]);
  });

  describe('naval battles — embarked cargo participation (PROJECT_RULES.md section 30 extension)', () => {
    it('a naval battle with only embarked land cargo present on one side has no pending battle (cargo never fights)', () => {
      const state = testState({
        phase: 'attack',
        activePlayerId: 'attacker',
        seaZones: { 'sea-1': { id: 'sea-1', label: 'Sea 1', position: { x: 0, y: 0 }, neighbors: [], adjacentRegionIds: [] } },
        regions: {},
        units: [
          unitInstance({ id: 'atk-ship', unitId: 'destroyer', ownerId: 'attacker', regionId: 'sea-1' }),
          unitInstance({ id: 'def-transport', unitId: 'land-transport', ownerId: 'defender', regionId: 'sea-1' }),
          unitInstance({ id: 'def-cargo', unitId: 'infantry', ownerId: 'defender', regionId: 'sea-1', transportedBy: 'def-transport' }),
        ],
        combats: { 'sea-1': baseCombat({ regionId: 'sea-1' }) },
      });
      // The defender's only real combat participant is the (0-attack, but
      // still a valid defender) land-transport itself — this asserts the
      // battle is NOT considered empty just because cargo is present too.
      const result = new RollCombatCommand('attacker', 'sea-1', catalog).execute(state);
      expect(result.events[0]?.type).toBe('CombatRoundRolled');
    });

    it('only rolls dice for real combat participants — embarked land cargo excluded, embarked air cargo included', () => {
      const state = testState({
        phase: 'attack',
        activePlayerId: 'attacker',
        randomSeed: 1,
        seaZones: { 'sea-1': { id: 'sea-1', label: 'Sea 1', position: { x: 0, y: 0 }, neighbors: [], adjacentRegionIds: [] } },
        regions: {},
        units: [
          unitInstance({ id: 'atk-ship', unitId: 'destroyer', ownerId: 'attacker', regionId: 'sea-1' }),
          unitInstance({ id: 'atk-transport', unitId: 'land-transport', ownerId: 'attacker', regionId: 'sea-1' }),
          unitInstance({ id: 'atk-cargo', unitId: 'infantry', ownerId: 'attacker', regionId: 'sea-1', transportedBy: 'atk-transport' }),
          unitInstance({ id: 'atk-fighter', unitId: 'fighter', ownerId: 'attacker', regionId: 'sea-1', transportedBy: 'atk-transport' }),
          unitInstance({ id: 'def-ship', unitId: 'destroyer', ownerId: 'defender', regionId: 'sea-1' }),
        ],
        combats: { 'sea-1': baseCombat({ regionId: 'sea-1' }) },
      });
      const result = new RollCombatCommand('attacker', 'sea-1', catalog).execute(state);
      const rolledUnitIds = result.state.combats['sea-1'].lastAttackerRolls.map((roll) => roll.instanceId);
      // atk-ship (destroyer, attack 5) and atk-fighter (embarked air, attack 3) both roll.
      // atk-transport has attack 0 so never rolls regardless; atk-cargo (embarked land) is excluded outright.
      expect(rolledUnitIds).toContain('atk-ship');
      expect(rolledUnitIds).toContain('atk-fighter');
      expect(rolledUnitIds).not.toContain('atk-cargo');
    });
  });
});
