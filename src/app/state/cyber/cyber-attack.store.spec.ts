import { TestBed } from '@angular/core/testing';
import { CyberAttackStore } from './cyber-attack.store';
import { GameCoreStore } from '../core/game-core.store';
import { DataLoaderService, InitialGameData } from '../../services/data-loader.service';
import { RandomService } from '../../services/random.service';
import { faction, player, region, testState, TEST_ECONOMY_CONFIG } from '../../engine/test-fixtures';

function fakeInitialGameData(overrides: Partial<InitialGameData> = {}): InitialGameData {
  return {
    gameState: testState({
      phase: 'cyberAttack',
      activePlayerId: 'p1',
      players: [player({ id: 'p1', treasury: 10 }), player({ id: 'p2', treasury: 10, hackLevel: 6 })],
      regions: { home: region({ id: 'home', ownerId: null, neighbors: [] }) },
      randomSeed: 1,
    }),
    factions: [faction({ id: 'p1', teamId: 'team-east' }), faction({ id: 'p2', teamId: 'team-west' })],
    units: {},
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

describe('CyberAttackStore', () => {
  function setup(fakeData: InitialGameData = fakeInitialGameData()): {
    cyberAttackStore: InstanceType<typeof CyberAttackStore>;
    gameCoreStore: InstanceType<typeof GameCoreStore>;
  } {
    TestBed.configureTestingModule({
      providers: [
        { provide: DataLoaderService, useValue: { loadInitialGameData: () => Promise.resolve(fakeData) } },
        { provide: RandomService, useValue: { seed: () => {} } },
      ],
    });
    return { cyberAttackStore: TestBed.inject(CyberAttackStore), gameCoreStore: TestBed.inject(GameCoreStore) };
  }

  it('starts with no rejection or result message', () => {
    const { cyberAttackStore } = setup();
    expect(cyberAttackStore.cyberAttackRejectionReason()).toBeNull();
    expect(cyberAttackStore.cyberAttackResultMessage()).toBeNull();
  });

  it('hack rejects a teammate and sets cyberAttackRejectionReason', async () => {
    const { cyberAttackStore, gameCoreStore } = setup(
      fakeInitialGameData({ factions: [faction({ id: 'p1', teamId: 'team-east' }), faction({ id: 'p2', teamId: 'team-east' })] }),
    );
    await gameCoreStore.initialize();

    cyberAttackStore.hack('p1', 'p2');

    expect(cyberAttackStore.cyberAttackRejectionReason()).toBe('You cannot hack a teammate (PROJECT_RULES.md section 2)');
  });

  it('hack against a rival succeeds and sets a result message, clearing any stale rejection', async () => {
    const { cyberAttackStore, gameCoreStore } = setup();
    await gameCoreStore.initialize();

    cyberAttackStore.hack('p1', 'p2');

    expect(cyberAttackStore.cyberAttackRejectionReason()).toBeNull();
    expect(cyberAttackStore.cyberAttackResultMessage()).toMatch(/^Hack (succeeded|failed)/);
  });

  it('upgradeHackLevel succeeds and sets a result message', async () => {
    const { cyberAttackStore, gameCoreStore } = setup();
    await gameCoreStore.initialize();

    cyberAttackStore.upgradeHackLevel('p1');

    expect(cyberAttackStore.cyberAttackResultMessage()).toBe('Hack Level upgraded to 2.');
  });

  it('politicalInfluence on a neutral region resolves and sets a result message', async () => {
    const { cyberAttackStore, gameCoreStore } = setup();
    await gameCoreStore.initialize();

    cyberAttackStore.politicalInfluence('p1', 'home');

    expect(cyberAttackStore.cyberAttackResultMessage()).toMatch(/^Political Influence (succeeded|failed)/);
  });

  it('reactToEvents clears the rejection reason on a "success elsewhere" event like RegionCaptured', async () => {
    const { cyberAttackStore, gameCoreStore } = setup(
      fakeInitialGameData({ factions: [faction({ id: 'p1', teamId: 'team-east' }), faction({ id: 'p2', teamId: 'team-east' })] }),
    );
    await gameCoreStore.initialize();
    cyberAttackStore.hack('p1', 'p2');
    expect(cyberAttackStore.cyberAttackRejectionReason()).not.toBeNull();

    cyberAttackStore.reactToEvents([{ type: 'RegionCaptured', playerId: 'p1', regionId: 'home', previousOwnerId: null }]);

    expect(cyberAttackStore.cyberAttackRejectionReason()).toBeNull();
  });
});
