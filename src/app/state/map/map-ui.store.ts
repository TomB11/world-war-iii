import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';
import { RulesEngine } from '../../engine/rules-engine';
import { SelectRegionCommand } from '../../engine/commands/select-region.command';
import { GameEngineEvent } from '../../interfaces/game-events';
import {
  FlagTransitionQueueEntry,
  MapEffectEvent,
  MissileFiredQueueEntry,
  UnitDragState,
  UnitMoveQueueEntry,
} from '../../interfaces/map-types';
import { Region } from '../../models/region.model';
import { SeaZone } from '../../models/sea-zone.model';
import { GameCoreStore } from '../core/game-core.store';

/**
 * An armed "click a highlighted region on the map" action (PROJECT_RULES.md
 * section 18/30) — the click-to-place counterpart to a canvas drag, used for
 * deploying a Reserve unit or unloading embarked cargo, since neither has an
 * existing map icon to pick up and drag. `subjectId` is the Reserve unit's
 * catalog id for a deploy, or the embarked UnitInstance id for an unload.
 */
export interface PendingMapAction {
  readonly kind: 'deploy' | 'unload';
  readonly subjectId: string;
  readonly destinations: readonly string[];
}

interface MapUiSlice {
  readonly selectedRegionId: string | null;
  readonly hoveredRegionId: string | null;
  readonly externalDrag: UnitDragState | null;
  readonly pendingAction: PendingMapAction | null;
  readonly mapEffectEvents: readonly MapEffectEvent[];
  readonly unitMoveEvents: readonly UnitMoveQueueEntry[];
  readonly missileFiredEvents: readonly MissileFiredQueueEntry[];
  readonly flagTransitionEvents: readonly FlagTransitionQueueEntry[];
}

const initialState: MapUiSlice = {
  selectedRegionId: null,
  hoveredRegionId: null,
  externalDrag: null,
  pendingAction: null,
  mapEffectEvents: [],
  unitMoveEvents: [],
  missileFiredEvents: [],
  flagTransitionEvents: [],
};

const rules = new RulesEngine();

/**
 * Pure UI state for the map (CODING_STANDARDS.md section 10: "Use Signals
 * for UI state only") plus the map-highlight computeds and animation-event
 * queues every dispatching store's actions feed via `reactToEvents()`.
 * Replaces `state/map.state.ts`'s `MapUiState` and the map-visual slice of
 * the old monolithic `GameStore`.
 *
 * Selection is driven by engine events (via `reactToEvents`, called by
 * whichever store just ran `GameCoreStore.dispatch()`) rather than mutated
 * ad hoc by components — the signals themselves hold no gameplay logic,
 * only "what is currently highlighted/animating on screen".
 */
export const MapUiStore = signalStore(
  { providedIn: 'root' },
  withState<MapUiSlice>(initialState),
  withComputed((store) => {
    const gameCoreStore = inject(GameCoreStore);
    return {
      selectedRegion: computed<Region | null>(() => {
        const id = store.selectedRegionId();
        if (!id) {
          return null;
        }
        return gameCoreStore.regions()[id] ?? null;
      }),
      selectedSeaZone: computed<SeaZone | null>(() => {
        const id = store.selectedRegionId();
        if (!id) {
          return null;
        }
        return gameCoreStore.seaZones()[id] ?? null;
      }),
      /**
       * Instance ids of the active player's units that can actually do
       * something this movement phase (PROJECT_RULES.md sections 7/17) —
       * used by the map to highlight movable units. Attack Moves
       * (attack-only) counts a unit as movable if it can reach a hostile
       * region to attack; Tactical Moves counts units that did NOT fight
       * this turn and have a friendly-territory destination. Empty outside
       * the two movement phases.
       */
      movableUnitIds: computed<ReadonlySet<string>>(() => {
        const state = gameCoreStore.state();
        const player = gameCoreStore.activePlayer();
        if (!state || !player) {
          return new Set();
        }
        if (state.phase !== 'attackMoves' && state.phase !== 'tacticalMoves') {
          return new Set();
        }
        const catalog = gameCoreStore.units();
        const factions = gameCoreStore.factions();
        const ids = new Set<string>();
        for (const unit of state.units) {
          if (unit.ownerId !== player.id || unit.transportedBy !== null || unit.movesRemaining <= 0) {
            continue;
          }
          // A unit that can board an adjacent transport can act in either phase.
          const canLoad = rules.getLoadableTransportTargets(state, unit, catalog).length > 0;
          if (state.phase === 'tacticalMoves') {
            if (unit.hasFoughtThisTurn) {
              continue;
            }
            if (canLoad || rules.getTacticalMoveDestinations(state, unit, catalog, factions).length > 0) {
              ids.add(unit.id);
            }
          } else {
            // Attack Moves is attack-only (PROJECT_RULES.md section 7): a
            // unit is movable here only if it can reach a hostile region to
            // attack (or board a transport to get there).
            if (canLoad || rules.getLegalAttackTargets(state, unit, catalog, factions).length > 0) {
              ids.add(unit.id);
            }
          }
        }
        return ids;
      }),
      /**
       * Regions holding an unresolved Attack Phase battle for the active
       * player (PROJECT_RULES.md sections 7/8/9-14) — only these are
       * highlighted and clickable on the map while `phase === 'attack'`.
       * Empty in every other phase, same gating pattern as movableUnitIds.
       */
      contestedRegionIds: computed<ReadonlySet<string>>(() => {
        const state = gameCoreStore.state();
        const player = gameCoreStore.activePlayer();
        if (!state || !player || state.phase !== 'attack') {
          return new Set();
        }
        return new Set(rules.getContestedRegionIds(state, player.id, gameCoreStore.factions()));
      }),
      /**
       * Declared-but-unfired Rocket System missile strikes (PROJECT_RULES.md
       * section 15), resolved from GameState.missileDeclarations to the
       * launcher's current region + its target region, for the map to draw
       * a trajectory line between them. The launcher itself never moves, so
       * its region only ever changes if it's later ordered elsewhere.
       */
      missileStrikePreviews: computed<readonly { readonly launcherRegionId: string; readonly targetRegionId: string }[]>(
        () => {
          const state = gameCoreStore.state();
          if (!state) {
            return [];
          }
          const previews: { launcherRegionId: string; targetRegionId: string }[] = [];
          for (const [targetRegionId, launcherUnitId] of Object.entries(state.missileDeclarations)) {
            const launcher = state.units.find((unit) => unit.id === launcherUnitId);
            if (launcher) {
              previews.push({ launcherRegionId: launcher.regionId, targetRegionId });
            }
          }
          return previews;
        },
      ),
    };
  }),
  withComputed((store) => ({
    neighborIds: computed<readonly string[]>(() => store.selectedRegion()?.neighbors ?? []),
  })),
  withMethods((store) => {
    const gameCoreStore = inject(GameCoreStore);
    let nextMapEffectId = 1;
    let nextUnitMoveId = 1;
    let nextMissileFiredId = 1;
    let nextFlagTransitionId = 1;

    /** Queues an explosion/glitch/spawn burst at regionId for WorldMapComponent to pick up — capped to a small rolling window since only the last moment or two is ever still-animating by the time a consumer next reads it. */
    function pushMapEffect(regionId: string, kind: MapEffectEvent['kind']): void {
      const id = nextMapEffectId++;
      patchState(store, { mapEffectEvents: [...store.mapEffectEvents(), { id, regionId, kind }].slice(-40) });
    }
    /** Queues a sliding-icon animation for a unit that just moved from one region/sea-zone to another. */
    function pushUnitMove(unitInstanceId: string, fromRegionId: string, toRegionId: string): void {
      const id = nextUnitMoveId++;
      patchState(store, {
        unitMoveEvents: [...store.unitMoveEvents(), { id, unitInstanceId, fromRegionId, toRegionId }].slice(-40),
      });
    }
    /** Queues a projectile animation for a missile that just fired from launcherRegionId at regionId. */
    function pushMissileFired(launcherRegionId: string, regionId: string): void {
      const id = nextMissileFiredId++;
      patchState(store, {
        missileFiredEvents: [...store.missileFiredEvents(), { id, launcherRegionId, regionId }].slice(-40),
      });
    }
    /** Queues a flag-crossfade animation for a region that just changed hands. */
    function pushFlagTransition(regionId: string, previousOwnerId: string | null): void {
      const id = nextFlagTransitionId++;
      patchState(store, {
        flagTransitionEvents: [...store.flagTransitionEvents(), { id, regionId, previousOwnerId }].slice(-40),
      });
    }
    /** A player's capital region id, for cyber-attack effects that target a player rather than a region directly (e.g. Hack). */
    function resolveCapitalRegionId(playerId: string): string | undefined {
      const player = gameCoreStore.state()?.players.find((candidate) => candidate.id === playerId);
      if (!player) {
        return undefined;
      }
      return gameCoreStore.factions()[player.factionId]?.capitalRegionId;
    }

    /**
     * Reacts to a just-dispatched command's events for every map-visual
     * concern this store owns — selection follow (RegionContested opens
     * the pending battle), the 4 animation queues, and clearing the armed
     * click-to-place action once a phase/turn actually advances. Called by
     * whichever store just ran `GameCoreStore.dispatch()`.
     */
    function handleEvents(events: readonly GameEngineEvent[]): void {
      for (const event of events) {
        switch (event.type) {
          case 'RegionSelected':
            patchState(store, { selectedRegionId: event.regionId });
            break;
          case 'RegionDeselected':
            patchState(store, { selectedRegionId: null });
            break;
          case 'RegionContested':
            // Pop the contested region open so the player sees the pending
            // battle (defenders + war symbol + attackers) right after the move.
            patchState(store, { selectedRegionId: event.regionId });
            pushMapEffect(event.regionId, 'explosion');
            break;
          case 'UnitMoved':
            pushUnitMove(event.unitInstanceId, event.fromRegionId, event.toRegionId);
            break;
          case 'UnitDeployed':
            pushMapEffect(event.regionId, 'spawn');
            break;
          case 'MissileFired':
            pushMissileFired(event.launcherRegionId, event.regionId);
            break;
          case 'CasualtyRemoved':
            pushMapEffect(event.regionId, 'explosion');
            break;
          case 'HackResolved': {
            const capitalRegionId = resolveCapitalRegionId(event.targetPlayerId);
            if (capitalRegionId) {
              pushMapEffect(capitalRegionId, 'glitch');
            }
            break;
          }
          case 'PoliticalInfluenceResolved':
            pushMapEffect(event.regionId, 'glitch');
            break;
          case 'AiSabotageResolved':
            pushMapEffect(event.targetRegionId, 'glitch');
            break;
          case 'FreeMissileStrikeResolved':
            pushMapEffect(event.targetRegionId, 'explosion');
            break;
          case 'RegionCaptured':
            pushMapEffect(event.regionId, 'explosion');
            pushFlagTransition(event.regionId, event.previousOwnerId);
            break;
          case 'PhaseAdvanced':
          case 'TurnEnded':
            patchState(store, { pendingAction: null });
            break;
        }
      }
    }

    return {
      setSelected(regionId: string | null): void {
        patchState(store, { selectedRegionId: regionId });
      },
      setHovered(regionId: string | null): void {
        patchState(store, { hoveredRegionId: regionId });
      },
      startExternalDrag(drag: UnitDragState): void {
        patchState(store, { externalDrag: drag });
      },
      endExternalDrag(): void {
        patchState(store, { externalDrag: null });
      },
      armPendingAction(action: PendingMapAction): void {
        patchState(store, { pendingAction: action });
      },
      clearPendingAction(): void {
        patchState(store, { pendingAction: null });
      },
      /** Selects (or deselects, for null) a map location — a land Region or a SeaZone (PROJECT_RULES.md map interaction). */
      selectRegion(regionId: string): void {
        handleEvents(gameCoreStore.dispatch(new SelectRegionCommand(regionId)));
      },
      clearSelection(): void {
        handleEvents(gameCoreStore.dispatch(new SelectRegionCommand(null)));
      },
      /**
       * Reacts to events fired by another store's dispatch (today: every
       * dispatch, via GameStore's bridge and AiTurnService's manual
       * forwarding) for every map-visual concern this store owns — see
       * handleEvents.
       */
      reactToEvents(events: readonly GameEngineEvent[]): void {
        handleEvents(events);
      },
    };
  }),
);
