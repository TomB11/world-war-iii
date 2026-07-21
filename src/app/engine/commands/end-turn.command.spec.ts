import { EndTurnCommand } from './end-turn.command';
import { Faction } from '../../models/faction.model';
import { UnitDefinition } from '../../models/unit.model';
import { must, player, region, testState, TEST_ECONOMY_CONFIG, unitDef } from '../test-fixtures';

describe('EndTurnCommand', () => {
  const factions: Readonly<Record<string, Faction>> = {
    f1: { id: 'f1', name: 'Faction One', color: '#fff', capitalRegionId: 'capital', teamId: 't1' },
  };
  const unitCatalog: Readonly<Record<string, UnitDefinition>> = {
    infantry: unitDef({ id: 'infantry', movement: 1 }),
  };

  function run(overrides: Parameters<typeof testState>[0], endingPlayerId = 'p1') {
    const state = testState({
      phase: 'collectIncome',
      activePlayerId: endingPlayerId,
      players: [player({ id: 'p1', factionId: 'f1' }), player({ id: 'p2', factionId: 'f1' })],
      ...overrides,
    });
    const command = new EndTurnCommand(endingPlayerId, TEST_ECONOMY_CONFIG, factions, unitCatalog);
    return { state, result: command.execute(state) };
  }

  it('rotates the active player and resets phase to buyUnits', () => {
    const { result } = run({});

    expect(result.state.activePlayerId).toBe('p2');
    expect(result.state.phase).toBe('buyUnits');
  });

  it('increments turnNumber only when play wraps back to an earlier player', () => {
    const { result: first } = run({});
    expect(first.state.turnNumber).toBe(1);

    const { result: wrapped } = run({ turnNumber: 1 }, 'p2');
    expect(wrapped.state.turnNumber).toBe(2);
  });

  it('decays the incoming player Citizen Satisfaction and escalates rebellionLevel in the red zone', () => {
    const { result } = run({
      players: [
        player({ id: 'p1' }),
        player({ id: 'p2', citizenSatisfaction: 20, rebellionLevel: 1 }),
      ],
    });

    const nextP2 = must(result.state.players.find((p) => p.id === 'p2'), 'expected p2 in players');
    expect(nextP2.citizenSatisfaction).toBe(15);
    expect(nextP2.rebellionLevel).toBe(2);
  });

  it('spawns a rebel army at the capital once rebellionLevel first reaches 3, using ids that never collide with existing units', () => {
    const { result } = run({
      regions: { capital: region({ id: 'capital', ownerId: 'p2', factory: 1 }) },
      units: [{ id: 'unit-1', unitId: 'infantry', ownerId: 'p2', regionId: 'capital', movesRemaining: 1, transportedBy: null, hasFoughtThisTurn: false }],
      nextUnitInstanceId: 2,
      players: [
        player({ id: 'p1', factionId: 'f1' }),
        player({ id: 'p2', factionId: 'f1', citizenSatisfaction: 20, rebellionLevel: 2 }),
      ],
    });

    const rebelUnits = result.state.units.filter((u) => u.ownerId === 'rebels');
    expect(rebelUnits.length).toBe(2);
    expect(rebelUnits.every((u) => u.regionId === 'capital')).toBe(true);

    const allIds = result.state.units.map((u) => u.id);
    expect(new Set(allIds).size).toBe(allIds.length);
    expect(result.state.nextUnitInstanceId).toBe(4);
    expect(result.events.some((e) => e.type === 'RebelArmySpawned')).toBe(true);
  });

  it('does not spawn a rebel army if the faction no longer holds its capital', () => {
    const { result } = run({
      regions: { capital: region({ id: 'capital', ownerId: 'enemy', factory: 1 }) },
      players: [
        player({ id: 'p1', factionId: 'f1' }),
        player({ id: 'p2', factionId: 'f1', citizenSatisfaction: 20, rebellionLevel: 2 }),
      ],
    });

    expect(result.state.units.some((u) => u.ownerId === 'rebels')).toBe(false);
    expect(result.events.some((e) => e.type === 'RebelArmySpawned')).toBe(false);
  });
});
