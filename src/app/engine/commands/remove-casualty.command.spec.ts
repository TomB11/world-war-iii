import { RemoveCasualtyCommand } from './remove-casualty.command';
import { RegionCombat } from '../../models/region-combat.model';
import { UnitDefinition } from '../../models/unit.model';
import { must, player, region, testState, TEST_ECONOMY_CONFIG, unitDef, unitInstance } from '../test-fixtures';
import { SeaZone } from '../../models/sea-zone.model';

describe('RemoveCasualtyCommand', () => {
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

  it('captures the region by force and applies Citizen Satisfaction penalties once the last defender falls', () => {
    const state = testState({
      phase: 'attack',
      activePlayerId: 'attacker',
      turnNumber: 4,
      regions: { battleground: region({ id: 'battleground', ownerId: 'defender' }) },
      players: [player({ id: 'attacker', citizenSatisfaction: 50 }), player({ id: 'defender', citizenSatisfaction: 50 })],
      units: [
        unitInstance({ id: 'atk-1', unitId: 'infantry', ownerId: 'attacker', regionId: 'battleground' }),
        unitInstance({ id: 'def-1', unitId: 'infantry', ownerId: 'defender', regionId: 'battleground' }),
      ],
      combats: { battleground: baseCombat() },
    });

    const command = new RemoveCasualtyCommand('attacker', 'battleground', 'def-1', catalog, TEST_ECONOMY_CONFIG);
    const result = command.execute(state);

    expect(result.state.regions['battleground'].ownerId).toBe('attacker');
    // Stamped so a factory here can't produce until held a full round (PROJECT_RULES.md section 18).
    expect(result.state.regions['battleground'].capturedOnTurn).toBe(4);
    expect(result.state.combats['battleground']).toBeUndefined();
    expect(result.state.units.some((u) => u.id === 'def-1')).toBe(false);

    const attacker = must(result.state.players.find((p) => p.id === 'attacker'), 'expected attacker in players');
    const defender = must(result.state.players.find((p) => p.id === 'defender'), 'expected defender in players');
    expect(attacker.citizenSatisfaction).toBe(45);
    expect(defender.citizenSatisfaction).toBe(45);

    expect(result.events.some((e) => e.type === 'RegionCaptured')).toBe(true);
    expect(result.events.some((e) => e.type === 'RegionCombatResolved' && e.captured === true)).toBe(true);
  });

  it('repels the attack (ownership unchanged, no penalties) once the last attacker falls', () => {
    const state = testState({
      phase: 'attack',
      activePlayerId: 'attacker',
      regions: { battleground: region({ id: 'battleground', ownerId: 'defender' }) },
      players: [player({ id: 'attacker', citizenSatisfaction: 50 }), player({ id: 'defender', citizenSatisfaction: 50 })],
      units: [
        unitInstance({ id: 'atk-1', unitId: 'infantry', ownerId: 'attacker', regionId: 'battleground' }),
        unitInstance({ id: 'def-1', unitId: 'infantry', ownerId: 'defender', regionId: 'battleground' }),
      ],
      combats: {
        battleground: baseCombat({ step: 'attackerCasualty', pendingDefenderCasualties: 0, pendingAttackerCasualties: 1 }),
      },
    });

    const command = new RemoveCasualtyCommand('attacker', 'battleground', 'atk-1', catalog, TEST_ECONOMY_CONFIG);
    const result = command.execute(state);

    expect(result.state.regions['battleground'].ownerId).toBe('defender');
    expect(result.state.combats['battleground']).toBeUndefined();

    const attacker = must(result.state.players.find((p) => p.id === 'attacker'), 'expected attacker in players');
    const defender = must(result.state.players.find((p) => p.id === 'defender'), 'expected defender in players');
    expect(attacker.citizenSatisfaction).toBe(50);
    expect(defender.citizenSatisfaction).toBe(50);

    expect(result.events.some((e) => e.type === 'RegionCombatResolved' && e.captured === false)).toBe(true);
  });

  it('continues the battle (decrementing the pending count) when more casualties remain on the losing side', () => {
    const state = testState({
      phase: 'attack',
      activePlayerId: 'attacker',
      regions: { battleground: region({ id: 'battleground', ownerId: 'defender' }) },
      players: [player({ id: 'attacker' }), player({ id: 'defender' })],
      units: [
        unitInstance({ id: 'atk-1', unitId: 'infantry', ownerId: 'attacker', regionId: 'battleground' }),
        unitInstance({ id: 'def-1', unitId: 'infantry', ownerId: 'defender', regionId: 'battleground' }),
        unitInstance({ id: 'def-2', unitId: 'infantry', ownerId: 'defender', regionId: 'battleground' }),
      ],
      combats: { battleground: baseCombat({ pendingDefenderCasualties: 2 }) },
    });

    const command = new RemoveCasualtyCommand('attacker', 'battleground', 'def-1', catalog, TEST_ECONOMY_CONFIG);
    const result = command.execute(state);

    const nextCombat = result.state.combats['battleground'];
    expect(nextCombat).toBeDefined();
    expect(nextCombat.pendingDefenderCasualties).toBe(1);
    expect(nextCombat.step).toBe('defenderCasualty');
    expect(result.state.regions['battleground'].ownerId).toBe('defender');
  });

  it('rejects removing a unit that does not belong to the side taking losses', () => {
    const state = testState({
      phase: 'attack',
      activePlayerId: 'attacker',
      regions: { battleground: region({ id: 'battleground', ownerId: 'defender' }) },
      players: [player({ id: 'attacker' }), player({ id: 'defender' })],
      units: [
        unitInstance({ id: 'atk-1', unitId: 'infantry', ownerId: 'attacker', regionId: 'battleground' }),
        unitInstance({ id: 'def-1', unitId: 'infantry', ownerId: 'defender', regionId: 'battleground' }),
      ],
      combats: { battleground: baseCombat() },
    });

    const command = new RemoveCasualtyCommand('attacker', 'battleground', 'atk-1', catalog, TEST_ECONOMY_CONFIG);
    const result = command.execute(state);

    expect(result.events).toEqual([{ type: 'CombatRejected', playerId: 'attacker', reason: 'That unit is not part of the side taking losses' }]);
    expect(result.state).toBe(state);
  });

  describe('naval battles (this.regionId is a sea zone, not a Region)', () => {
    function seaZoneState(overrides: Parameters<typeof testState>[0] = {}) {
      const seaZone: SeaZone = { id: 'sea-1', label: 'Sea 1', position: { x: 0, y: 0 }, neighbors: [], adjacentRegionIds: [] };
      return testState({
        phase: 'attack',
        activePlayerId: 'attacker',
        regions: {},
        seaZones: { 'sea-1': seaZone },
        players: [player({ id: 'attacker', citizenSatisfaction: 50 }), player({ id: 'defender', citizenSatisfaction: 50 })],
        combats: { 'sea-1': baseCombat({ regionId: 'sea-1' }) },
        ...overrides,
      });
    }

    it('a naval victory clears the fight without capturing anything or applying a Citizen Satisfaction penalty', () => {
      const state = seaZoneState({
        units: [
          unitInstance({ id: 'atk-ship', unitId: 'destroyer', ownerId: 'attacker', regionId: 'sea-1' }),
          unitInstance({ id: 'def-ship', unitId: 'destroyer', ownerId: 'defender', regionId: 'sea-1' }),
        ],
      });

      const command = new RemoveCasualtyCommand('attacker', 'sea-1', 'def-ship', catalog, TEST_ECONOMY_CONFIG);
      const result = command.execute(state);

      expect(result.state.combats['sea-1']).toBeUndefined();
      expect(result.state.units.some((u) => u.id === 'def-ship')).toBe(false);
      expect(result.events.some((e) => e.type === 'RegionCaptured')).toBe(false);
      expect(result.events.some((e) => e.type === 'RegionCombatResolved' && e.captured === true)).toBe(true);

      const attacker = must(result.state.players.find((p) => p.id === 'attacker'), 'expected attacker in players');
      const defender = must(result.state.players.find((p) => p.id === 'defender'), 'expected defender in players');
      expect(attacker.citizenSatisfaction).toBe(50);
      expect(defender.citizenSatisfaction).toBe(50);
    });

    it('rejects choosing embarked land cargo as a casualty — it never fought', () => {
      const state = seaZoneState({
        units: [
          unitInstance({ id: 'atk-ship', unitId: 'destroyer', ownerId: 'attacker', regionId: 'sea-1' }),
          unitInstance({ id: 'def-transport', unitId: 'land-transport', ownerId: 'defender', regionId: 'sea-1' }),
          unitInstance({ id: 'def-cargo', unitId: 'infantry', ownerId: 'defender', regionId: 'sea-1', transportedBy: 'def-transport' }),
        ],
      });

      const command = new RemoveCasualtyCommand('attacker', 'sea-1', 'def-cargo', catalog, TEST_ECONOMY_CONFIG);
      const result = command.execute(state);

      expect(result.events).toEqual([
        { type: 'CombatRejected', playerId: 'attacker', reason: 'That unit is embarked cargo and never fought — it cannot be chosen as a casualty' },
      ]);
      expect(result.state).toBe(state);
    });

    it('allows choosing embarked air cargo as a casualty — a carried Fighter still fights', () => {
      const state = seaZoneState({
        units: [
          unitInstance({ id: 'atk-ship', unitId: 'destroyer', ownerId: 'attacker', regionId: 'sea-1' }),
          unitInstance({ id: 'def-carrier', unitId: 'land-transport', ownerId: 'defender', regionId: 'sea-1' }),
          unitInstance({ id: 'def-fighter', unitId: 'fighter', ownerId: 'defender', regionId: 'sea-1', transportedBy: 'def-carrier' }),
        ],
        combats: { 'sea-1': baseCombat({ regionId: 'sea-1', pendingDefenderCasualties: 1 }) },
      });

      const command = new RemoveCasualtyCommand('attacker', 'sea-1', 'def-fighter', catalog, TEST_ECONOMY_CONFIG);
      const result = command.execute(state);

      expect(result.state.units.some((u) => u.id === 'def-fighter')).toBe(false);
      // The carrier itself wasn't the casualty — it survives, cargo or not.
      expect(result.state.units.some((u) => u.id === 'def-carrier')).toBe(true);
    });

    it('sinking a transport destroys everything still embarked on it, cargo included', () => {
      const state = seaZoneState({
        units: [
          unitInstance({ id: 'atk-ship', unitId: 'destroyer', ownerId: 'attacker', regionId: 'sea-1' }),
          unitInstance({ id: 'def-ship', unitId: 'destroyer', ownerId: 'defender', regionId: 'sea-1' }),
          unitInstance({ id: 'atk-transport', unitId: 'land-transport', ownerId: 'attacker', regionId: 'sea-1' }),
          unitInstance({ id: 'atk-cargo-1', unitId: 'infantry', ownerId: 'attacker', regionId: 'sea-1', transportedBy: 'atk-transport' }),
          unitInstance({ id: 'atk-cargo-2', unitId: 'fighter', ownerId: 'attacker', regionId: 'sea-1', transportedBy: 'atk-transport' }),
        ],
        combats: {
          'sea-1': baseCombat({ regionId: 'sea-1', step: 'attackerCasualty', pendingDefenderCasualties: 0, pendingAttackerCasualties: 1 }),
        },
      });

      const command = new RemoveCasualtyCommand('attacker', 'sea-1', 'atk-transport', catalog, TEST_ECONOMY_CONFIG);
      const result = command.execute(state);

      const remainingIds = result.state.units.map((u) => u.id);
      expect(remainingIds).not.toContain('atk-transport');
      expect(remainingIds).not.toContain('atk-cargo-1');
      expect(remainingIds).not.toContain('atk-cargo-2');
      // The attacker's real combatant (the destroyer) survives — combat continues.
      expect(remainingIds).toContain('atk-ship');
      expect(result.state.combats['sea-1']).toBeDefined();
    });
  });
});
