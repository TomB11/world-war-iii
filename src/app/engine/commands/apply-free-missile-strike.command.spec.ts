import { ApplyFreeMissileStrikeCommand } from './apply-free-missile-strike.command';
import { UnitDefinition } from '../../models/unit.model';
import { player, region, testState, unitInstance } from '../test-fixtures';

describe('ApplyFreeMissileStrikeCommand', () => {
  const catalog: Readonly<Record<string, UnitDefinition>> = {
    infantry: { id: 'infantry', name: 'Infantry', category: 'land', cost: 5, attack: 1, defense: 2, movement: 1, transportCapacity: 0 },
    'missile-a': { id: 'missile-a', name: 'Missile A', category: 'missile', cost: 15, attack: 2, defense: 0, movement: 0, transportCapacity: 0 },
    'rocket-system': { id: 'rocket-system', name: 'Rocket System', category: 'support', cost: 10, attack: 0, defense: 2, movement: 1, transportCapacity: 0, canDeclareMissile: true },
  };

  it('is a no-op when the player has no missile in Reserve', () => {
    const state = testState({
      regions: { target: region({ id: 'target', ownerId: 'enemy' }) },
      players: [player({ id: 'p1', reserve: [] })],
      units: [unitInstance({ id: 'd1', unitId: 'infantry', ownerId: 'enemy', regionId: 'target' })],
    });
    const result = new ApplyFreeMissileStrikeCommand('p1', 'target', catalog).execute(state);
    expect(result.events).toEqual([]);
    expect(result.state).toBe(state);
  });

  it('is a no-op when the target region has no defenders', () => {
    const state = testState({
      regions: { target: region({ id: 'target', ownerId: 'enemy' }) },
      players: [player({ id: 'p1', reserve: [{ unitId: 'missile-a', quantity: 1 }] })],
      units: [],
    });
    const result = new ApplyFreeMissileStrikeCommand('p1', 'target', catalog).execute(state);
    expect(result.events).toEqual([]);
    expect(result.state).toBe(state);
  });

  it('consumes one missile from Reserve regardless of outcome', () => {
    const state = testState({
      randomSeed: 1,
      regions: { target: region({ id: 'target', ownerId: 'enemy' }) },
      players: [player({ id: 'p1', reserve: [{ unitId: 'missile-a', quantity: 1 }] })],
      units: [unitInstance({ id: 'd1', unitId: 'infantry', ownerId: 'enemy', regionId: 'target' })],
    });
    const result = new ApplyFreeMissileStrikeCommand('p1', 'target', catalog).execute(state);
    expect(result.state.players.find((p) => p.id === 'p1')?.reserve).toEqual([]);
  });

  it('never captures the region even on a hit — a missile strike alone only removes a casualty', () => {
    let seed = 1;
    let result;
    for (let attempt = 0; attempt < 200; attempt += 1) {
      const state = testState({
        randomSeed: seed,
        regions: { target: region({ id: 'target', ownerId: 'enemy' }) },
        players: [player({ id: 'p1', reserve: [{ unitId: 'missile-a', quantity: 1 }] })],
        units: [unitInstance({ id: 'd1', unitId: 'infantry', ownerId: 'enemy', regionId: 'target' })],
      });
      result = new ApplyFreeMissileStrikeCommand('p1', 'target', catalog).execute(state);
      const event = result.events[0];
      if (event?.type === 'FreeMissileStrikeResolved' && event.outcome === 'hit') {
        break;
      }
      seed += 1;
    }
    expect(result?.state.regions['target'].ownerId).toBe('enemy');
    expect(result?.state.units.find((u) => u.id === 'd1')).toBeUndefined();
  });

  it('advances the random seed', () => {
    const state = testState({
      randomSeed: 1,
      regions: { target: region({ id: 'target', ownerId: 'enemy' }) },
      players: [player({ id: 'p1', reserve: [{ unitId: 'missile-a', quantity: 1 }] })],
      units: [unitInstance({ id: 'd1', unitId: 'infantry', ownerId: 'enemy', regionId: 'target' })],
    });
    const result = new ApplyFreeMissileStrikeCommand('p1', 'target', catalog).execute(state);
    expect(result.state.randomSeed).not.toBe(state.randomSeed);
  });
});
