import { RemoveCasualtyCommand } from './remove-casualty.command';
import { RegionCombat } from '../../models/region-combat.model';
import { must, player, region, testState, TEST_ECONOMY_CONFIG, unitInstance } from '../test-fixtures';

describe('RemoveCasualtyCommand', () => {
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
      missileResult: null,
      ...overrides,
    };
  }

  it('captures the region by force and applies Citizen Satisfaction penalties once the last defender falls', () => {
    const state = testState({
      phase: 'attack',
      activePlayerId: 'attacker',
      regions: { battleground: region({ id: 'battleground', ownerId: 'defender' }) },
      players: [player({ id: 'attacker', citizenSatisfaction: 50 }), player({ id: 'defender', citizenSatisfaction: 50 })],
      units: [
        unitInstance({ id: 'atk-1', unitId: 'infantry', ownerId: 'attacker', regionId: 'battleground' }),
        unitInstance({ id: 'def-1', unitId: 'infantry', ownerId: 'defender', regionId: 'battleground' }),
      ],
      combats: { battleground: baseCombat() },
    });

    const command = new RemoveCasualtyCommand('attacker', 'battleground', 'def-1', TEST_ECONOMY_CONFIG);
    const result = command.execute(state);

    expect(result.state.regions['battleground'].ownerId).toBe('attacker');
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

    const command = new RemoveCasualtyCommand('attacker', 'battleground', 'atk-1', TEST_ECONOMY_CONFIG);
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

    const command = new RemoveCasualtyCommand('attacker', 'battleground', 'def-1', TEST_ECONOMY_CONFIG);
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

    const command = new RemoveCasualtyCommand('attacker', 'battleground', 'atk-1', TEST_ECONOMY_CONFIG);
    const result = command.execute(state);

    expect(result.events).toEqual([{ type: 'CombatRejected', playerId: 'attacker', reason: 'That unit is not part of the side taking losses' }]);
    expect(result.state).toBe(state);
  });
});
