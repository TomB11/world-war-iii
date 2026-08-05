import { pickHackTarget, pickInfluenceTarget, pickRichestEnemyRegion } from './ai-cyber-targets.util';
import { RulesEngine } from '../rules-engine';
import { faction, player, region, testState } from '../test-fixtures';

describe('pickHackTarget', () => {
  it('returns null when there are no other players', () => {
    const state = testState({ players: [player({ id: 'p1' })] });
    expect(pickHackTarget(state, 'p1', {}, new RulesEngine())).toBeNull();
  });

  it('picks the richest non-eliminated rival', () => {
    const state = testState({
      players: [
        player({ id: 'p1', treasury: 5 }),
        player({ id: 'p2', treasury: 20 }),
        player({ id: 'p3', treasury: 50 }),
      ],
    });
    expect(pickHackTarget(state, 'p1', {}, new RulesEngine())).toBe('p3');
  });

  it('excludes eliminated rivals', () => {
    const state = testState({
      players: [
        player({ id: 'p1', treasury: 5 }),
        player({ id: 'p2', treasury: 100, isEliminated: true }),
        player({ id: 'p3', treasury: 20 }),
      ],
    });
    expect(pickHackTarget(state, 'p1', {}, new RulesEngine())).toBe('p3');
  });

  it('never targets a teammate, even if they are the richest rival (PROJECT_RULES.md section 2 — hacking an ally is not allowed)', () => {
    const factions = {
      p1: faction({ id: 'p1', teamId: 'team-east' }),
      p2: faction({ id: 'p2', teamId: 'team-east' }),
      p3: faction({ id: 'p3', teamId: 'team-west' }),
    };
    const state = testState({
      players: [
        player({ id: 'p1', treasury: 5 }),
        player({ id: 'p2', treasury: 100 }),
        player({ id: 'p3', treasury: 20 }),
      ],
    });
    expect(pickHackTarget(state, 'p1', factions, new RulesEngine())).toBe('p3');
  });
});

describe('pickRichestEnemyRegion', () => {
  it('returns null when there are no rival-owned regions', () => {
    const state = testState({
      regions: { home: region({ id: 'home', ownerId: 'p1' }), neutral: region({ id: 'neutral', ownerId: null }) },
    });
    expect(pickRichestEnemyRegion(state, 'p1', {}, new RulesEngine())).toBeNull();
  });

  it('picks the highest-value region owned by any rival', () => {
    const state = testState({
      regions: {
        home: region({ id: 'home', ownerId: 'p1', value: 10 }),
        'enemy-poor': region({ id: 'enemy-poor', ownerId: 'p2', value: 2 }),
        'enemy-rich': region({ id: 'enemy-rich', ownerId: 'p3', value: 6 }),
      },
    });
    expect(pickRichestEnemyRegion(state, 'p1', {}, new RulesEngine())).toBe('enemy-rich');
  });

  it('never targets a teammate\'s region, even if it is the richest (sabotage/free-missile-strike are attacks)', () => {
    const factions = {
      p1: faction({ id: 'p1', teamId: 'team-east' }),
      p2: faction({ id: 'p2', teamId: 'team-east' }),
      p3: faction({ id: 'p3', teamId: 'team-west' }),
    };
    const state = testState({
      players: [player({ id: 'p1' }), player({ id: 'p2' }), player({ id: 'p3' })],
      regions: {
        home: region({ id: 'home', ownerId: 'p1', value: 10 }),
        ally: region({ id: 'ally', ownerId: 'p2', value: 50 }),
        'enemy-rich': region({ id: 'enemy-rich', ownerId: 'p3', value: 6 }),
      },
    });
    expect(pickRichestEnemyRegion(state, 'p1', factions, new RulesEngine())).toBe('enemy-rich');
  });
});

describe('pickInfluenceTarget', () => {
  const rules = new RulesEngine();

  it('returns null when no neutral region borders the player', () => {
    const state = testState({
      regions: {
        home: region({ id: 'home', ownerId: 'p1', neighbors: ['enemy'] }),
        enemy: region({ id: 'enemy', ownerId: 'enemy', neighbors: ['home'] }),
      },
    });
    expect(pickInfluenceTarget(state, 'p1', rules)).toBeNull();
  });

  it('picks the highest-value neutral region bordering one of the player\'s own regions', () => {
    const state = testState({
      regions: {
        home: region({ id: 'home', ownerId: 'p1', neighbors: ['poor-neutral', 'rich-neutral'] }),
        'poor-neutral': region({ id: 'poor-neutral', ownerId: null, value: 2, neighbors: ['home'] }),
        'rich-neutral': region({ id: 'rich-neutral', ownerId: null, value: 5, neighbors: ['home'] }),
      },
    });
    expect(pickInfluenceTarget(state, 'p1', rules)).toBe('rich-neutral');
  });

  it('ignores a neutral region that does not border any owned region', () => {
    const state = testState({
      regions: {
        home: region({ id: 'home', ownerId: 'p1', neighbors: [] }),
        'far-neutral': region({ id: 'far-neutral', ownerId: null, value: 9, neighbors: [] }),
      },
    });
    expect(pickInfluenceTarget(state, 'p1', rules)).toBeNull();
  });
});
