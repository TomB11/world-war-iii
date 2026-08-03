import { getCommittingUnitIds, pickAttackTargetRegion } from './ai-order-targets.util';
import { RulesEngine } from '../rules-engine';
import { region, testState, unitDef, unitInstance } from '../test-fixtures';
import { UnitDefinition } from '../../models/unit.model';

describe('pickAttackTargetRegion', () => {
  const rules = new RulesEngine();
  const catalog: Readonly<Record<string, UnitDefinition>> = {
    infantry: unitDef({ id: 'infantry', attack: 1, defense: 2, movement: 1 }),
    helicopter: unitDef({ id: 'helicopter', attack: 3, defense: 2, movement: 3, canCapture: false }),
    'rocket-system': unitDef({ id: 'rocket-system', attack: 0, defense: 2, movement: 1, canDeclareMissile: true }),
  };

  it('returns null when there are no candidate units at all', () => {
    const state = testState({ phase: 'attackMoves', activePlayerId: 'p1', regions: {}, units: [] });
    expect(pickAttackTargetRegion(state, 'p1', 'attackNearest', catalog, {}, rules)).toBeNull();
  });

  it('never considers a Rocket System (attack: 0) as an attacker', () => {
    const state = testState({
      phase: 'attackMoves',
      activePlayerId: 'p1',
      regions: {
        home: region({ id: 'home', ownerId: 'p1', neighbors: ['empty'] }),
        empty: region({ id: 'empty', ownerId: 'enemy', value: 3, neighbors: ['home'] }),
      },
      units: [unitInstance({ id: 'u1', unitId: 'rocket-system', ownerId: 'p1', regionId: 'home', movesRemaining: 1 })],
    });
    expect(pickAttackTargetRegion(state, 'p1', 'attackNearest', catalog, {}, rules)).toBeNull();
  });

  it('attackNearest picks the lowest hop-cost target, defended or not', () => {
    const state = testState({
      phase: 'attackMoves',
      activePlayerId: 'p1',
      regions: {
        home: region({ id: 'home', ownerId: 'p1', neighbors: ['mid'] }),
        mid: region({ id: 'mid', ownerId: 'p1', neighbors: ['home', 'far'] }),
        far: region({ id: 'far', ownerId: 'enemy', value: 3, neighbors: ['mid'] }),
      },
      units: [
        unitInstance({ id: 'u1', unitId: 'infantry', ownerId: 'p1', regionId: 'home', movesRemaining: 2 }),
        unitInstance({ id: 'defender', unitId: 'infantry', ownerId: 'enemy', regionId: 'far', movesRemaining: 1 }),
      ],
    });
    expect(pickAttackTargetRegion(state, 'p1', 'attackNearest', catalog, {}, rules)).toBe('far');
  });

  it('attackRichestAdjacent picks the highest-value adjacent region even if defended', () => {
    const state = testState({
      phase: 'attackMoves',
      activePlayerId: 'p1',
      regions: {
        home: region({ id: 'home', ownerId: 'p1', neighbors: ['poor', 'rich'] }),
        poor: region({ id: 'poor', ownerId: 'enemy', value: 2, neighbors: ['home'] }),
        rich: region({ id: 'rich', ownerId: 'enemy', value: 6, neighbors: ['home'] }),
      },
      units: [
        unitInstance({ id: 'u1', unitId: 'infantry', ownerId: 'p1', regionId: 'home', movesRemaining: 1 }),
        unitInstance({ id: 'defender', unitId: 'infantry', ownerId: 'enemy', regionId: 'rich', movesRemaining: 1 }),
      ],
    });
    expect(pickAttackTargetRegion(state, 'p1', 'attackRichestAdjacent', catalog, {}, rules)).toBe('rich');
  });

  it('attackWeakestAdjacent picks the adjacent region with the lowest total defense value', () => {
    const state = testState({
      phase: 'attackMoves',
      activePlayerId: 'p1',
      regions: {
        home: region({ id: 'home', ownerId: 'p1', neighbors: ['strong', 'weak'] }),
        strong: region({ id: 'strong', ownerId: 'enemy', value: 4, neighbors: ['home'] }),
        weak: region({ id: 'weak', ownerId: 'enemy', value: 4, neighbors: ['home'] }),
      },
      units: [
        unitInstance({ id: 'u1', unitId: 'infantry', ownerId: 'p1', regionId: 'home', movesRemaining: 1 }),
        unitInstance({ id: 'd1', unitId: 'infantry', ownerId: 'enemy', regionId: 'strong', movesRemaining: 1 }),
        unitInstance({ id: 'd2', unitId: 'infantry', ownerId: 'enemy', regionId: 'strong', movesRemaining: 1 }),
        unitInstance({ id: 'd3', unitId: 'helicopter', ownerId: 'enemy', regionId: 'weak', movesRemaining: 1 }),
      ],
    });
    // "strong" has 2 infantry defenders (defense 2 each = 4 total); "weak" has 1 helicopter (defense 2 total).
    expect(pickAttackTargetRegion(state, 'p1', 'attackWeakestAdjacent', catalog, {}, rules)).toBe('weak');
  });

  it('returns null for order actions this build step does not attack on (reinforce/pressure-neutral/doctrine special)', () => {
    const state = testState({
      phase: 'attackMoves',
      activePlayerId: 'p1',
      regions: {
        home: region({ id: 'home', ownerId: 'p1', neighbors: ['empty'] }),
        empty: region({ id: 'empty', ownerId: 'enemy', value: 3, neighbors: ['home'] }),
      },
      units: [unitInstance({ id: 'u1', unitId: 'infantry', ownerId: 'p1', regionId: 'home', movesRemaining: 1 })],
    });
    expect(pickAttackTargetRegion(state, 'p1', 'reinforceThreatened', catalog, {}, rules)).toBeNull();
    expect(pickAttackTargetRegion(state, 'p1', 'pressureNeutral', catalog, {}, rules)).toBeNull();
    expect(pickAttackTargetRegion(state, 'p1', 'doctrineSpecial', catalog, {}, rules)).toBeNull();
  });

  describe('getCommittingUnitIds', () => {
    it('excludes a Helicopter (canCapture: false) when the target is undefended', () => {
      const state = testState({
        phase: 'attackMoves',
        activePlayerId: 'p1',
        regions: {
          home: region({ id: 'home', ownerId: 'p1', neighbors: ['empty'] }),
          empty: region({ id: 'empty', ownerId: 'enemy', value: 3, neighbors: ['home'] }),
        },
        units: [
          unitInstance({ id: 'infantry-unit', unitId: 'infantry', ownerId: 'p1', regionId: 'home', movesRemaining: 1 }),
          unitInstance({ id: 'heli-unit', unitId: 'helicopter', ownerId: 'p1', regionId: 'home', movesRemaining: 3 }),
        ],
      });
      const committing = getCommittingUnitIds(state, 'p1', 'empty', catalog, {}, rules);
      expect(committing).toContain('infantry-unit');
      expect(committing).not.toContain('heli-unit');
    });

    it('includes a Helicopter when the target IS defended — it can still fight, just never solo-capture', () => {
      const state = testState({
        phase: 'attackMoves',
        activePlayerId: 'p1',
        regions: {
          home: region({ id: 'home', ownerId: 'p1', neighbors: ['defended'] }),
          defended: region({ id: 'defended', ownerId: 'enemy', value: 3, neighbors: ['home'] }),
        },
        units: [
          unitInstance({ id: 'heli-unit', unitId: 'helicopter', ownerId: 'p1', regionId: 'home', movesRemaining: 3 }),
          unitInstance({ id: 'defender', unitId: 'infantry', ownerId: 'enemy', regionId: 'defended', movesRemaining: 1 }),
        ],
      });
      const committing = getCommittingUnitIds(state, 'p1', 'defended', catalog, {}, rules);
      expect(committing).toContain('heli-unit');
    });
  });
});
