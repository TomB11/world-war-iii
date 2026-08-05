import { TestBed } from '@angular/core/testing';
import { MovementStore } from './movement.store';
import { GameCoreStore } from '../core/game-core.store';
import { MapUiStore } from '../map/map-ui.store';
import { DataLoaderService, InitialGameData } from '../../services/data-loader.service';
import { RandomService } from '../../services/random.service';
import { faction, player, region, testState, unitDef, unitInstance, TEST_ECONOMY_CONFIG } from '../../engine/test-fixtures';

function fakeInitialGameData(overrides: Partial<InitialGameData> = {}): InitialGameData {
  return {
    gameState: testState({
      phase: 'placeNewUnits',
      players: [player({ id: 'p1', reserve: [{ unitId: 'infantry', quantity: 2 }] }), player({ id: 'p2' })],
      regions: {
        home: region({ id: 'home', ownerId: 'p1', factory: 2, neighbors: ['front'] }),
        front: region({ id: 'front', ownerId: 'p2', neighbors: ['home'] }),
      },
      units: [unitInstance({ id: 'def-1', unitId: 'infantry', ownerId: 'p2', regionId: 'front' })],
    }),
    factions: [faction({ id: 'p1', teamId: 'team-east' }), faction({ id: 'p2', teamId: 'team-west' })],
    units: { infantry: unitDef({ id: 'infantry', attack: 1, defense: 1, movement: 1 }) },
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

describe('MovementStore', () => {
  function setup(fakeData: InitialGameData = fakeInitialGameData()): {
    movementStore: InstanceType<typeof MovementStore>;
    gameCoreStore: InstanceType<typeof GameCoreStore>;
    mapUiStore: InstanceType<typeof MapUiStore>;
  } {
    TestBed.configureTestingModule({
      providers: [
        { provide: DataLoaderService, useValue: { loadInitialGameData: () => Promise.resolve(fakeData) } },
        { provide: RandomService, useValue: { seed: () => {} } },
      ],
    });
    return {
      movementStore: TestBed.inject(MovementStore),
      gameCoreStore: TestBed.inject(GameCoreStore),
      mapUiStore: TestBed.inject(MapUiStore),
    };
  }

  it('starts with no movement rejection', () => {
    const { movementStore } = setup();
    expect(movementStore.movementRejectionReason()).toBeNull();
  });

  it('reportInvalidDestination sets the rejection reason directly (no engine round-trip)', () => {
    const { movementStore } = setup();
    movementStore.reportInvalidDestination();
    expect(movementStore.movementRejectionReason()).toBe('That is not a legal destination for this unit.');
  });

  it('deployUnit succeeds at a friendly factory region and clears any previous rejection', async () => {
    const { movementStore, gameCoreStore } = setup();
    await gameCoreStore.initialize();
    movementStore.reportInvalidDestination();

    movementStore.deployUnit('p1', 'infantry', 'home');

    expect(movementStore.movementRejectionReason()).toBeNull();
    expect(gameCoreStore.state()?.units.some((u) => u.unitId === 'infantry' && u.regionId === 'home')).toBe(true);
  });

  it('deployUnit rejects outside the Place New Units phase and sets movementRejectionReason', async () => {
    const { movementStore, gameCoreStore } = setup(
      fakeInitialGameData({ gameState: { ...fakeInitialGameData().gameState, phase: 'buyUnits' } }),
    );
    await gameCoreStore.initialize();

    movementStore.deployUnit('p1', 'infantry', 'home');

    expect(movementStore.movementRejectionReason()).not.toBeNull();
  });

  it('armDeployUnit arms MapUiStore\'s pending action with this unit\'s legal deploy destinations', async () => {
    const { movementStore, gameCoreStore, mapUiStore } = setup();
    await gameCoreStore.initialize();

    movementStore.armDeployUnit('infantry');

    expect(mapUiStore.pendingAction()).toEqual({ kind: 'deploy', subjectId: 'infantry', destinations: ['home'] });
  });

  it('resolvePendingActionAt deploys the armed unit at a legal destination and clears the pending action', async () => {
    const { movementStore, gameCoreStore, mapUiStore } = setup();
    await gameCoreStore.initialize();
    movementStore.armDeployUnit('infantry');

    const handled = movementStore.resolvePendingActionAt('home');

    expect(handled).toBe(true);
    expect(mapUiStore.pendingAction()).toBeNull();
    expect(gameCoreStore.state()?.units.some((u) => u.unitId === 'infantry' && u.regionId === 'home')).toBe(true);
  });

  it('legalAttackTargets reaches a hostile neighbor during Attack Moves', async () => {
    const { movementStore, gameCoreStore } = setup(
      fakeInitialGameData({
        gameState: {
          ...fakeInitialGameData().gameState,
          phase: 'attackMoves',
          units: [
            unitInstance({ id: 'atk-1', unitId: 'infantry', ownerId: 'p1', regionId: 'home', movesRemaining: 1 }),
            unitInstance({ id: 'def-1', unitId: 'infantry', ownerId: 'p2', regionId: 'front' }),
          ],
        },
      }),
    );
    await gameCoreStore.initialize();

    expect(movementStore.legalAttackTargets('atk-1')).toEqual(['front']);
  });
});
