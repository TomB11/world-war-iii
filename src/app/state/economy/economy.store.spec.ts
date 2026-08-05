import { TestBed } from '@angular/core/testing';
import { EconomyStore } from './economy.store';
import { GameCoreStore } from '../core/game-core.store';
import { DataLoaderService, InitialGameData } from '../../services/data-loader.service';
import { RandomService } from '../../services/random.service';
import { faction, player, region, testState, unitDef, TEST_ECONOMY_CONFIG } from '../../engine/test-fixtures';

function fakeInitialGameData(overrides: Partial<InitialGameData> = {}): InitialGameData {
  return {
    gameState: testState({
      phase: 'buyUnits',
      players: [player({ id: 'p1', treasury: 10, citizenSatisfaction: 50 }), player({ id: 'p2' })],
      regions: { home: region({ id: 'home', ownerId: 'p1', factory: 2, neighbors: [] }) },
    }),
    factions: [faction({ id: 'p1', teamId: 'team-east' }), faction({ id: 'p2', teamId: 'team-west' })],
    units: { infantry: unitDef({ id: 'infantry', cost: 3 }) },
    economyConfig: TEST_ECONOMY_CONFIG,
    aiPurchaseChart: {} as unknown as InitialGameData['aiPurchaseChart'],
    aiOrderTable: {} as unknown as InitialGameData['aiOrderTable'],
    aiAttackConditions: {} as unknown as InitialGameData['aiAttackConditions'],
    aiCyberActionTable: {} as unknown as InitialGameData['aiCyberActionTable'],
    aiThreatTrack: {} as unknown as InitialGameData['aiThreatTrack'],
    aiDifficulty: { presets: {} },
    aiSabotageEffects: {} as unknown as InitialGameData['aiSabotageEffects'],
    ...overrides,
  };
}

describe('EconomyStore', () => {
  function setup(fakeData: InitialGameData = fakeInitialGameData()): {
    economyStore: InstanceType<typeof EconomyStore>;
    gameCoreStore: InstanceType<typeof GameCoreStore>;
  } {
    TestBed.configureTestingModule({
      providers: [
        { provide: DataLoaderService, useValue: { loadInitialGameData: () => Promise.resolve(fakeData) } },
        { provide: RandomService, useValue: { seed: () => {} } },
      ],
    });
    return { economyStore: TestBed.inject(EconomyStore), gameCoreStore: TestBed.inject(GameCoreStore) };
  }

  it('starts with no rejection reasons', () => {
    const { economyStore } = setup();
    expect(economyStore.purchaseRejectionReason()).toBeNull();
    expect(economyStore.publicSpendingRejectionReason()).toBeNull();
  });

  it('purchaseUnit succeeds and deducts treasury, clearing any stale rejection', async () => {
    const { economyStore, gameCoreStore } = setup();
    await gameCoreStore.initialize();

    economyStore.purchaseUnit('p1', 'infantry', 2);

    expect(economyStore.purchaseRejectionReason()).toBeNull();
    expect(gameCoreStore.state()?.players.find((p) => p.id === 'p1')?.treasury).toBe(4);
    expect(
      gameCoreStore.state()?.players.find((p) => p.id === 'p1')?.reserve.find((e) => e.unitId === 'infantry')?.quantity,
    ).toBe(2);
  });

  it('purchaseUnit rejects when it is not the Buy Units phase and sets purchaseRejectionReason', async () => {
    const baseData = fakeInitialGameData();
    const { economyStore, gameCoreStore } = setup(
      fakeInitialGameData({ gameState: { ...baseData.gameState, phase: 'attackMoves' } }),
    );
    await gameCoreStore.initialize();

    economyStore.purchaseUnit('p1', 'infantry', 1);

    expect(economyStore.purchaseRejectionReason()).not.toBeNull();
  });

  it('raiseCitizenSatisfaction spends treasury to raise satisfaction', async () => {
    const { economyStore, gameCoreStore } = setup();
    await gameCoreStore.initialize();

    economyStore.raiseCitizenSatisfaction('p1', 5);

    expect(economyStore.publicSpendingRejectionReason()).toBeNull();
    const player = gameCoreStore.state()?.players.find((p) => p.id === 'p1');
    expect(player?.treasury).toBe(5);
    expect(player?.citizenSatisfaction).toBe(55);
  });

  it('reactToEvents clears both rejection reasons on a "success elsewhere" event like RegionCaptured', async () => {
    const { economyStore, gameCoreStore } = setup();
    await gameCoreStore.initialize();
    // Simulate a stale rejection from an earlier failed attempt (unknown unit id).
    economyStore.purchaseUnit('p1', 'unknown-unit', 1);
    expect(economyStore.purchaseRejectionReason()).not.toBeNull();

    economyStore.reactToEvents([{ type: 'RegionCaptured', playerId: 'p1', regionId: 'home', previousOwnerId: null }]);

    expect(economyStore.purchaseRejectionReason()).toBeNull();
  });
});
