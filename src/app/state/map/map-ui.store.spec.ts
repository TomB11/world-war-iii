import { TestBed } from '@angular/core/testing';
import { MapUiStore } from './map-ui.store';
import { GameCoreStore } from '../core/game-core.store';
import { DataLoaderService, InitialGameData } from '../../services/data-loader.service';
import { RandomService } from '../../services/random.service';
import { faction, player, region, testState, unitDef, unitInstance, TEST_ECONOMY_CONFIG } from '../../engine/test-fixtures';

function fakeInitialGameData(overrides: Partial<InitialGameData> = {}): InitialGameData {
  return {
    gameState: testState({
      phase: 'attackMoves',
      players: [player({ id: 'p1' }), player({ id: 'p2' })],
      regions: {
        home: region({ id: 'home', ownerId: 'p1', neighbors: ['front'] }),
        front: region({ id: 'front', ownerId: 'p2', neighbors: ['home'] }),
      },
      units: [unitInstance({ id: 'u1', unitId: 'infantry', ownerId: 'p1', regionId: 'home', movesRemaining: 1 })],
    }),
    factions: [faction({ id: 'p1', teamId: 'team-east' }), faction({ id: 'p2', teamId: 'team-west' })],
    units: { infantry: unitDef({ id: 'infantry', attack: 1 }) },
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

describe('MapUiStore', () => {
  function setup(fakeData: InitialGameData = fakeInitialGameData()): {
    mapUiStore: InstanceType<typeof MapUiStore>;
    gameCoreStore: InstanceType<typeof GameCoreStore>;
  } {
    TestBed.configureTestingModule({
      providers: [
        { provide: DataLoaderService, useValue: { loadInitialGameData: () => Promise.resolve(fakeData) } },
        { provide: RandomService, useValue: { seed: () => {} } },
      ],
    });
    return { mapUiStore: TestBed.inject(MapUiStore), gameCoreStore: TestBed.inject(GameCoreStore) };
  }

  it('starts with no selection, hover, drag, pending action, or queued animations', () => {
    const { mapUiStore } = setup();
    expect(mapUiStore.selectedRegionId()).toBeNull();
    expect(mapUiStore.hoveredRegionId()).toBeNull();
    expect(mapUiStore.externalDrag()).toBeNull();
    expect(mapUiStore.pendingAction()).toBeNull();
    expect(mapUiStore.mapEffectEvents()).toEqual([]);
    expect(mapUiStore.unitMoveEvents()).toEqual([]);
    expect(mapUiStore.missileFiredEvents()).toEqual([]);
    expect(mapUiStore.flagTransitionEvents()).toEqual([]);
  });

  it('setSelected/setHovered/armPendingAction/clearPendingAction update their own signals', () => {
    const { mapUiStore } = setup();
    mapUiStore.setSelected('home');
    expect(mapUiStore.selectedRegionId()).toBe('home');

    mapUiStore.setHovered('front');
    expect(mapUiStore.hoveredRegionId()).toBe('front');

    mapUiStore.armPendingAction({ kind: 'deploy', subjectId: 'infantry', destinations: ['home'] });
    expect(mapUiStore.pendingAction()).toEqual({ kind: 'deploy', subjectId: 'infantry', destinations: ['home'] });

    mapUiStore.clearPendingAction();
    expect(mapUiStore.pendingAction()).toBeNull();
  });

  it('selectedRegion/selectedSeaZone/neighborIds resolve against GameCoreStore once state is loaded', async () => {
    const { mapUiStore, gameCoreStore } = setup();
    await gameCoreStore.initialize();

    mapUiStore.setSelected('home');
    expect(mapUiStore.selectedRegion()?.id).toBe('home');
    expect(mapUiStore.selectedSeaZone()).toBeNull();
    expect(mapUiStore.neighborIds()).toEqual(['front']);
  });

  it('reactToEvents(RegionContested) selects the region and queues an explosion map effect', () => {
    const { mapUiStore } = setup();
    mapUiStore.reactToEvents([{ type: 'RegionContested', playerId: 'p1', regionId: 'front' }]);
    expect(mapUiStore.selectedRegionId()).toBe('front');
    expect(mapUiStore.mapEffectEvents()).toEqual([{ id: 1, regionId: 'front', kind: 'explosion' }]);
  });

  it('reactToEvents(UnitMoved) queues a sliding-icon animation', () => {
    const { mapUiStore } = setup();
    mapUiStore.reactToEvents([{ type: 'UnitMoved', unitInstanceId: 'u1', fromRegionId: 'home', toRegionId: 'front' }]);
    expect(mapUiStore.unitMoveEvents()).toEqual([
      { id: 1, unitInstanceId: 'u1', fromRegionId: 'home', toRegionId: 'front' },
    ]);
  });

  it('reactToEvents(PhaseAdvanced) clears the armed pending action', () => {
    const { mapUiStore } = setup();
    mapUiStore.armPendingAction({ kind: 'unload', subjectId: 'u1', destinations: ['front'] });
    mapUiStore.reactToEvents([{ type: 'PhaseAdvanced', phase: 'attack' }]);
    expect(mapUiStore.pendingAction()).toBeNull();
  });

  it('movableUnitIds is empty outside a movement phase', async () => {
    const { mapUiStore, gameCoreStore } = setup(fakeInitialGameData({ gameState: testState({ phase: 'buyUnits' }) }));
    await gameCoreStore.initialize();
    expect(mapUiStore.movableUnitIds().size).toBe(0);
  });
});
