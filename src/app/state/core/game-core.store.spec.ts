import { TestBed } from '@angular/core/testing';
import { GameCoreStore } from './game-core.store';
import { DataLoaderService, InitialGameData } from '../../services/data-loader.service';
import { RandomService } from '../../services/random.service';
import { SelectRegionCommand } from '../../engine/commands/select-region.command';
import { AdvancePhaseCommand } from '../../engine/commands/advance-phase.command';
import { AiDifficultyData } from '../../models/ai-difficulty.model';
import { faction, must, player, region, testState, unitDef, TEST_ECONOMY_CONFIG } from '../../engine/test-fixtures';

function fakeInitialGameData(overrides: Partial<InitialGameData> = {}): InitialGameData {
  const aiDifficulty: AiDifficultyData = {
    presets: {
      easy: { startingTreasuryDelta: -5, treasuryPerTurn: 0, freeCyberAttackEveryNTurns: 0 },
      normal: { startingTreasuryDelta: 0, treasuryPerTurn: 0, freeCyberAttackEveryNTurns: 0 },
      hard: { startingTreasuryDelta: 0, treasuryPerTurn: 3, freeCyberAttackEveryNTurns: 0 },
      nightmare: { startingTreasuryDelta: 0, treasuryPerTurn: 5, freeCyberAttackEveryNTurns: 2 },
    },
  };
  return {
    gameState: testState({
      players: [player({ id: 'p1' }), player({ id: 'p2' })],
      regions: { home: region({ id: 'home', ownerId: 'p1', neighbors: [] }) },
    }),
    factions: [faction({ id: 'p1', teamId: 'team-east' }), faction({ id: 'p2', teamId: 'team-west' })],
    units: { infantry: unitDef({ id: 'infantry' }) },
    economyConfig: TEST_ECONOMY_CONFIG,
    aiPurchaseChart: {} as unknown as InitialGameData['aiPurchaseChart'],
    aiOrderTable: {} as unknown as InitialGameData['aiOrderTable'],
    aiAttackConditions: {} as unknown as InitialGameData['aiAttackConditions'],
    aiCyberActionTable: {} as unknown as InitialGameData['aiCyberActionTable'],
    aiThreatTrack: {} as unknown as InitialGameData['aiThreatTrack'],
    aiDifficulty,
    aiSabotageEffects: {} as unknown as InitialGameData['aiSabotageEffects'],
    ...overrides,
  };
}

describe('GameCoreStore', () => {
  function setup(fakeData: InitialGameData = fakeInitialGameData()): InstanceType<typeof GameCoreStore> {
    TestBed.configureTestingModule({
      providers: [
        {
          provide: DataLoaderService,
          useValue: { loadInitialGameData: () => Promise.resolve(fakeData) },
        },
        { provide: RandomService, useValue: { seed: () => {} } },
      ],
    });
    return TestBed.inject(GameCoreStore);
  }

  it('starts unloaded, with every core signal at its default', () => {
    const store = setup();
    expect(store.state()).toBeNull();
    expect(store.isLoaded()).toBe(false);
    expect(store.loadError()).toBeNull();
    expect(store.regions()).toEqual({});
    expect(store.factions()).toEqual({});
    expect(store.phaseAdvanceRejectionReason()).toBeNull();
  });

  it('dispatch() is a no-op returning [] before initialize() has loaded any state', () => {
    const store = setup();
    expect(store.dispatch(new SelectRegionCommand('home'))).toEqual([]);
    expect(store.state()).toBeNull();
  });

  it('initialize() loads the core slice and applies Easy difficulty\'s starting treasury delta to AI-controlled players', async () => {
    const fakeData = fakeInitialGameData({
      gameState: testState({
        players: [player({ id: 'p1', treasury: 10 }), player({ id: 'p2', treasury: 10 })],
        regions: {},
        aiConfig: { doctrine: 'aggressor', difficulty: 'easy', aiTeamId: 'team-west', threatLevel: 0, totalWarActive: false },
      }),
      factions: [faction({ id: 'p1', teamId: 'team-east' }), faction({ id: 'p2', teamId: 'team-west' })],
    });
    const store = setup(fakeData);

    const result = await store.initialize();

    expect(result).toBe(fakeData);
    expect(store.isLoaded()).toBe(true);
    expect(store.state()?.players.find((p) => p.id === 'p1')?.treasury).toBe(10);
    expect(store.state()?.players.find((p) => p.id === 'p2')?.treasury).toBe(5);
  });

  it('initialize() sets loadError and returns null when the data loader rejects', async () => {
    TestBed.configureTestingModule({
      providers: [
        { provide: DataLoaderService, useValue: { loadInitialGameData: () => Promise.reject(new Error('boom')) } },
        { provide: RandomService, useValue: { seed: () => {} } },
      ],
    });
    const store = TestBed.inject(GameCoreStore);

    const result = await store.initialize();

    expect(result).toBeNull();
    expect(store.loadError()).toBe('boom');
    expect(store.isLoaded()).toBe(false);
  });

  it('advancePhase()/endTurn() are no-ops before any state is loaded', () => {
    const store = setup();
    expect(store.advancePhase('p1')).toEqual([]);
    expect(store.endTurn('p1')).toEqual([]);
  });

  it('dispatch() advances phase and returns the resulting events once state is loaded', async () => {
    const store = setup();
    await store.initialize();
    const before = must(store.state()?.phase, 'expected state to be loaded after initialize()');

    const events = store.dispatch(new AdvancePhaseCommand('p1', {}, {}));

    const phaseAfter = must(store.state()?.phase, 'expected state to be loaded after initialize()');
    expect(events).toEqual([{ type: 'PhaseAdvanced', phase: phaseAfter }]);
    expect(phaseAfter).not.toBe(before);
  });

  it('isCombatParticipant treats a non-embarked unit as always participating, regardless of catalog', () => {
    const store = setup();
    expect(
      store.isCombatParticipant({ id: 'u1', unitId: 'infantry', ownerId: 'p1', regionId: 'home', movesRemaining: 1, transportedBy: null, hasFoughtThisTurn: false }),
    ).toBe(true);
  });

  it('isHostileTo returns false (not hostile) before any state is loaded', () => {
    const store = setup();
    expect(store.isHostileTo('p1', 'p2')).toBe(false);
  });
});
