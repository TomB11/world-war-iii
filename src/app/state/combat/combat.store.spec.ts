import { TestBed } from '@angular/core/testing';
import { CombatStore } from './combat.store';
import { GameCoreStore } from '../core/game-core.store';
import { DataLoaderService, InitialGameData } from '../../services/data-loader.service';
import { RandomService } from '../../services/random.service';
import { faction, player, region, testState, unitDef, unitInstance, TEST_ECONOMY_CONFIG } from '../../engine/test-fixtures';

function fakeInitialGameData(overrides: Partial<InitialGameData> = {}): InitialGameData {
  return {
    gameState: testState({
      phase: 'buyUnits',
      players: [player({ id: 'p1' }), player({ id: 'p2' })],
      regions: {
        front: region({ id: 'front', ownerId: 'p1', neighbors: [] }),
      },
      units: [
        unitInstance({ id: 'atk-1', unitId: 'infantry', ownerId: 'p1', regionId: 'front' }),
        unitInstance({ id: 'def-1', unitId: 'infantry', ownerId: 'p2', regionId: 'front' }),
      ],
    }),
    factions: [faction({ id: 'p1', teamId: 'team-east' }), faction({ id: 'p2', teamId: 'team-west' })],
    units: { infantry: unitDef({ id: 'infantry', attack: 1, defense: 1 }) },
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

describe('CombatStore', () => {
  function setup(fakeData: InitialGameData = fakeInitialGameData()): {
    combatStore: InstanceType<typeof CombatStore>;
    gameCoreStore: InstanceType<typeof GameCoreStore>;
  } {
    TestBed.configureTestingModule({
      providers: [
        { provide: DataLoaderService, useValue: { loadInitialGameData: () => Promise.resolve(fakeData) } },
        { provide: RandomService, useValue: { seed: () => {} } },
      ],
    });
    return { combatStore: TestBed.inject(CombatStore), gameCoreStore: TestBed.inject(GameCoreStore) };
  }

  it('starts with no open battle and no messages', () => {
    const { combatStore } = setup();
    expect(combatStore.combatRegionId()).toBeNull();
    expect(combatStore.combatRejectionReason()).toBeNull();
    expect(combatStore.combatOutcomeMessage()).toBeNull();
    expect(combatStore.missileStrikeMessage()).toBeNull();
    expect(combatStore.activeCombat()).toBeNull();
  });

  it('openCombat sets the region and clears stale messages; closeCombat clears it again', () => {
    const { combatStore } = setup();
    combatStore.openCombat('front');
    expect(combatStore.combatRegionId()).toBe('front');
    combatStore.closeCombat();
    expect(combatStore.combatRegionId()).toBeNull();
  });

  it('rollCombat rejects outside the Attack Phase and sets combatRejectionReason', async () => {
    const { combatStore, gameCoreStore } = setup();
    await gameCoreStore.initialize(); // fixture phase is 'buyUnits', not 'attack'

    combatStore.rollCombat('p1', 'front');

    expect(combatStore.combatRejectionReason()).toBe('Combat can only be rolled during the Attack Phase');
  });

  it('activeCombat materializes an initial combat once a region is opened, even before any roll', async () => {
    const baseData = fakeInitialGameData();
    const { combatStore, gameCoreStore } = setup(
      fakeInitialGameData({ gameState: { ...baseData.gameState, phase: 'attack' } }),
    );
    await gameCoreStore.initialize();

    combatStore.openCombat('front');

    expect(combatStore.activeCombat()?.step).toBe('attackerRoll');
    expect(combatStore.activeCombat()?.round).toBe(1);
  });

  it('reactToEvents(MissileStrikeDeclared) sets the missile strike message from another store\'s dispatch', async () => {
    const { combatStore, gameCoreStore } = setup();
    await gameCoreStore.initialize();

    combatStore.reactToEvents([
      { type: 'MissileStrikeDeclared', playerId: 'p1', regionId: 'front', unitInstanceId: 'atk-1' },
    ]);

    expect(combatStore.missileStrikeMessage()).toBe('Missile strike declared on front.');
  });
});
