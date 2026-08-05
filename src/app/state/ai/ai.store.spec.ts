import { TestBed } from '@angular/core/testing';
import { AiStore } from './ai.store';
import { GameCoreStore } from '../core/game-core.store';
import { DataLoaderService, InitialGameData } from '../../services/data-loader.service';
import { RandomService } from '../../services/random.service';
import { faction, player, testState, TEST_ECONOMY_CONFIG } from '../../engine/test-fixtures';
import { AiThreatTrackData } from '../../models/ai-threat-track.model';
import { AiOrderTableData } from '../../models/ai-order.model';
import { AiPurchaseChartData } from '../../models/ai-purchase-chart.model';

const THREAT_TRACK: AiThreatTrackData = {
  maxLevel: 10,
  thresholds: [{ level: 1, bonus: 'treasury', amount: 5 }],
};

const ORDER_TABLE: AiOrderTableData = {
  table: {
    '1': 'attackNearest',
    '2': 'attackRichestAdjacent',
    '3': 'attackWeakestAdjacent',
    '4': 'reinforceThreatened',
    '5': 'pressureNeutral',
    '6': 'doctrineSpecial',
  },
};

const PURCHASE_CHART: AiPurchaseChartData = {
  chart: {
    '1': ['infantry'],
    '2': ['infantry'],
    '3': ['infantry'],
    '4': ['infantry'],
    '5': ['infantry'],
  },
  specialUnitOptions: ['destroyer'],
};

function fakeInitialGameData(overrides: Partial<InitialGameData> = {}): InitialGameData {
  return {
    gameState: testState({
      phase: 'buyUnits',
      activePlayerId: 'p1',
      players: [player({ id: 'p1', treasury: 10 }), player({ id: 'p2' })],
      aiConfig: { doctrine: 'aggressor', difficulty: 'hard', aiTeamId: 'team-east', threatLevel: 0, totalWarActive: false },
      randomSeed: 1,
    }),
    factions: [faction({ id: 'p1', teamId: 'team-east' }), faction({ id: 'p2', teamId: 'team-west' })],
    units: {},
    economyConfig: TEST_ECONOMY_CONFIG,
    aiPurchaseChart: PURCHASE_CHART,
    aiOrderTable: ORDER_TABLE,
    aiAttackConditions: {} as unknown as InitialGameData['aiAttackConditions'],
    aiCyberActionTable: {} as unknown as InitialGameData['aiCyberActionTable'],
    aiThreatTrack: THREAT_TRACK,
    aiDifficulty: { presets: { hard: { startingTreasuryDelta: 0, treasuryPerTurn: 3, freeCyberAttackEveryNTurns: 0 } } },
    aiSabotageEffects: {} as unknown as InitialGameData['aiSabotageEffects'],
    ...overrides,
  };
}

describe('AiStore', () => {
  function setup(fakeData: InitialGameData = fakeInitialGameData()): {
    aiStore: InstanceType<typeof AiStore>;
    gameCoreStore: InstanceType<typeof GameCoreStore>;
  } {
    TestBed.configureTestingModule({
      providers: [
        { provide: DataLoaderService, useValue: { loadInitialGameData: () => Promise.resolve(fakeData) } },
        { provide: RandomService, useValue: { seed: () => {} } },
      ],
    });
    return { aiStore: TestBed.inject(AiStore), gameCoreStore: TestBed.inject(GameCoreStore) };
  }

  it('starts with no static data and no scratch signals set', () => {
    const { aiStore } = setup();
    expect(aiStore.aiThreatTrack()).toBeNull();
    expect(aiStore.lastAiOrderAction()).toBeNull();
    expect(aiStore.aiTurnSummary()).toBeNull();
  });

  it('setStaticAiData stores the Solo Command Mode static tuning data', async () => {
    const { aiStore, gameCoreStore } = setup();
    const data = await gameCoreStore.initialize();
    if (!data) {
      throw new Error('Expected initialize() to resolve');
    }

    aiStore.setStaticAiData(data);

    expect(aiStore.aiThreatTrack()).toEqual(THREAT_TRACK);
    expect(aiStore.aiOrderTable()).toEqual(ORDER_TABLE);
  });

  it('isActivePlayerAiControlled reflects the active player\'s team vs. aiConfig.aiTeamId', async () => {
    const { aiStore, gameCoreStore } = setup();
    await gameCoreStore.initialize();

    expect(aiStore.isActivePlayerAiControlled()).toBe(true);
  });

  it('aiDifficultyPreset resolves the preset matching aiConfig.difficulty', async () => {
    const { aiStore, gameCoreStore } = setup();
    const data = await gameCoreStore.initialize();
    if (!data) {
      throw new Error('Expected initialize() to resolve');
    }
    aiStore.setStaticAiData(data);

    expect(aiStore.aiDifficultyPreset()).toEqual({ startingTreasuryDelta: 0, treasuryPerTurn: 3, freeCyberAttackEveryNTurns: 0 });
  });

  it('rollAiOrder dispatches and sets lastAiOrderAction to a valid table entry', async () => {
    const { aiStore, gameCoreStore } = setup();
    const data = await gameCoreStore.initialize();
    if (!data) {
      throw new Error('Expected initialize() to resolve');
    }
    aiStore.setStaticAiData(data);

    aiStore.rollAiOrder('p1');

    expect(aiStore.lastAiOrderAction()).not.toBeNull();
  });

  it('rollAiPurchaseChart dispatches and sets lastAiPurchaseChartUnitIds', async () => {
    const { aiStore, gameCoreStore } = setup();
    const data = await gameCoreStore.initialize();
    if (!data) {
      throw new Error('Expected initialize() to resolve');
    }
    aiStore.setStaticAiData(data);

    aiStore.rollAiPurchaseChart('p1');

    expect(aiStore.lastAiPurchaseChartUnitIds().length).toBeGreaterThan(0);
  });

  it('incrementThreat dispatches and reports a crossed threshold on level 1', async () => {
    const { aiStore, gameCoreStore } = setup();
    const data = await gameCoreStore.initialize();
    if (!data) {
      throw new Error('Expected initialize() to resolve');
    }
    aiStore.setStaticAiData(data);

    aiStore.incrementThreat('p1');

    expect(aiStore.lastThreatCrossedThreshold()).toEqual({ level: 1, bonus: 'treasury', amount: 5 });
    expect(gameCoreStore.state()?.aiConfig?.threatLevel).toBe(1);
  });

  it('grantFreeTreasury credits the player with no cost', async () => {
    const { aiStore, gameCoreStore } = setup();
    await gameCoreStore.initialize();

    aiStore.grantFreeTreasury('p1', 7, 'test bonus');

    expect(gameCoreStore.state()?.players.find((p) => p.id === 'p1')?.treasury).toBe(17);
  });

  it('narrateAiAction/beginAiTurnLog/finishAiTurnLog groups entries into aiTurnSummary by faction', async () => {
    const { aiStore, gameCoreStore } = setup();
    await gameCoreStore.initialize();

    aiStore.beginAiTurnLog();
    aiStore.narrateAiAction('p1', 'p1 did something.');
    aiStore.narrateAiAction('p1', 'p1 did something else.');
    aiStore.finishAiTurnLog();

    const summary = aiStore.aiTurnSummary();
    expect(summary).not.toBeNull();
    expect(summary?.[0]?.playerId).toBe('p1');
    expect(summary?.[0]?.actions).toEqual(['p1 did something.', 'p1 did something else.']);
  });

  it('finishAiTurnLog leaves aiTurnSummary untouched when nothing was narrated', async () => {
    const { aiStore, gameCoreStore } = setup();
    await gameCoreStore.initialize();

    aiStore.beginAiTurnLog();
    aiStore.finishAiTurnLog();

    expect(aiStore.aiTurnSummary()).toBeNull();
  });

  it('dismissAiTurnSummary clears the summary', async () => {
    const { aiStore, gameCoreStore } = setup();
    await gameCoreStore.initialize();
    aiStore.beginAiTurnLog();
    aiStore.narrateAiAction('p1', 'p1 acted.');
    aiStore.finishAiTurnLog();
    expect(aiStore.aiTurnSummary()).not.toBeNull();

    aiStore.dismissAiTurnSummary();

    expect(aiStore.aiTurnSummary()).toBeNull();
  });
});
