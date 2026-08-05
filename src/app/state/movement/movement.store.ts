import { inject } from '@angular/core';
import { patchState, signalStore, withMethods, withState } from '@ngrx/signals';
import { RulesEngine } from '../../engine/rules-engine';
import { DeployUnitCommand } from '../../engine/commands/deploy-unit.command';
import { MoveUnitCommand } from '../../engine/commands/move-unit.command';
import { LoadUnitCommand } from '../../engine/commands/load-unit.command';
import { UnloadUnitCommand } from '../../engine/commands/unload-unit.command';
import { AttackCommand } from '../../engine/commands/attack.command';
import { Command } from '../../interfaces/command';
import { GameEngineEvent } from '../../interfaces/game-events';
import { UnitDragState } from '../../interfaces/map-types';
import { MOVEMENT_PHASES } from '../../core/constants/game.constants';
import { GameCoreStore } from '../core/game-core.store';
import { MapUiStore } from '../map/map-ui.store';
import { CombatStore } from '../combat/combat.store';
import { clearsAllRejectionBanners } from '../shared/rejection-event-routing';

interface MovementSlice {
  readonly movementRejectionReason: string | null;
}

const initialState: MovementSlice = {
  movementRejectionReason: null,
};

const rules = new RulesEngine();

/**
 * Deploy/move/load/unload/attack (PROJECT_RULES.md sections 7/17/18/30) plus
 * the drag-and-drop + click-to-place orchestration that drives them from the
 * map. Replaces the movement slice of the old monolithic `GameStore`.
 */
export const MovementStore = signalStore(
  { providedIn: 'root' },
  withState(initialState),
  withMethods((store) => {
    const gameCoreStore = inject(GameCoreStore);
    const mapUiStore = inject(MapUiStore);
    const combatStore = inject(CombatStore);

    /** Reacts to events this store owns, whether from this store's own dispatch or another (not-yet-migrated) store's/GameCoreStore's advancePhase/endTurn. */
    function handleEvents(events: readonly GameEngineEvent[]): void {
      for (const event of events) {
        switch (event.type) {
          case 'RegionContested':
          case 'MissileStrikeDeclared':
            patchState(store, { movementRejectionReason: null });
            break;
          case 'MovementRejected':
            patchState(store, { movementRejectionReason: event.reason });
            break;
          default:
            if (clearsAllRejectionBanners(event)) {
              patchState(store, { movementRejectionReason: null });
            }
        }
      }
    }

    /** Runs `command` through GameCoreStore.dispatch() and forwards the resulting events to MapUiStore + CombatStore (this store's own dispatches bypass GameStore's bridge entirely) before reacting to whatever this store itself owns. */
    function dispatchAndHandle(command: Command): void {
      const events = gameCoreStore.dispatch(command);
      mapUiStore.reactToEvents(events);
      combatStore.reactToEvents(events);
      handleEvents(events);
    }

    return {
      deployUnit(playerId: string, unitId: string, regionId: string): void {
        dispatchAndHandle(new DeployUnitCommand(playerId, unitId, regionId, gameCoreStore.units(), rules));
      },
      moveUnit(playerId: string, unitInstanceId: string, destinationRegionId: string): void {
        dispatchAndHandle(
          new MoveUnitCommand(
            playerId,
            unitInstanceId,
            destinationRegionId,
            gameCoreStore.units(),
            gameCoreStore.factions(),
            rules,
          ),
        );
      },
      loadUnit(playerId: string, unitInstanceId: string, transportInstanceId: string): void {
        dispatchAndHandle(
          new LoadUnitCommand(playerId, unitInstanceId, transportInstanceId, gameCoreStore.units(), rules),
        );
      },
      unloadUnit(playerId: string, unitInstanceId: string, destinationRegionId: string): void {
        const economyConfig = gameCoreStore.economyConfig();
        if (!economyConfig) {
          return;
        }
        dispatchAndHandle(
          new UnloadUnitCommand(
            playerId,
            unitInstanceId,
            destinationRegionId,
            gameCoreStore.units(),
            economyConfig,
            gameCoreStore.factions(),
            rules,
          ),
        );
      },
      attackRegion(playerId: string, unitInstanceId: string, targetRegionId: string): void {
        const economyConfig = gameCoreStore.economyConfig();
        if (!economyConfig) {
          return;
        }
        dispatchAndHandle(
          new AttackCommand(
            playerId,
            unitInstanceId,
            targetRegionId,
            gameCoreStore.units(),
            economyConfig,
            gameCoreStore.factions(),
            rules,
          ),
        );
      },
      /**
       * Read-only preview of a unit's legal plain-move destinations. Plain
       * moves only happen during Tactical Moves (friendly territory only) —
       * with one exception (PROJECT_RULES.md section 7): naval units may
       * also reposition through sea zones during Attack Moves, so a
       * transport can load, sail, and amphibious-assault-unload its cargo
       * all in one phase (see MoveUnitCommand). Everything else returns []
       * outside Tactical Moves — Attack Moves is otherwise attack-only (see
       * legalAttackTargets).
       */
      legalMoveDestinations(unitInstanceId: string): readonly string[] {
        const state = gameCoreStore.state();
        const unit = state ? rules.getUnitInstance(state, unitInstanceId) : null;
        if (!state || !unit) {
          return [];
        }
        const isNavalRepositioning =
          state.phase === 'attackMoves' && gameCoreStore.units()[unit.unitId]?.category === 'naval';
        if (state.phase !== 'tacticalMoves' && !isNavalRepositioning) {
          return [];
        }
        return rules.getTacticalMoveDestinations(state, unit, gameCoreStore.units(), gameCoreStore.factions());
      },
      /** Read-only preview of a unit's legal attack targets, delegated to RulesEngine. */
      legalAttackTargets(unitInstanceId: string): readonly string[] {
        const state = gameCoreStore.state();
        const unit = state ? rules.getUnitInstance(state, unitInstanceId) : null;
        if (!state || !unit) {
          return [];
        }
        return rules.getLegalAttackTargets(state, unit, gameCoreStore.units(), gameCoreStore.factions());
      },
      /** Sea-zone drop targets that would load this unit onto a transport there (PROJECT_RULES.md section 30). */
      loadableTransportTargets(unitInstanceId: string): readonly { seaZoneId: string; transportId: string }[] {
        const state = gameCoreStore.state();
        const unit = state ? rules.getUnitInstance(state, unitInstanceId) : null;
        if (!state || !unit) {
          return [];
        }
        return rules.getLoadableTransportTargets(state, unit, gameCoreStore.units());
      },
      /** Coastal regions an embarked unit could disembark onto (PROJECT_RULES.md section 30). */
      unloadDestinations(unitInstanceId: string): readonly string[] {
        const state = gameCoreStore.state();
        const unit = state ? rules.getUnitInstance(state, unitInstanceId) : null;
        if (!state || !unit) {
          return [];
        }
        return rules.getUnloadDestinations(state, unit, gameCoreStore.factions());
      },
      /** Regions (or, for naval units, sea zones) a Reserve unit could be deployed to right now (PROJECT_RULES.md section 18). */
      deployDestinations(unitId: string): readonly string[] {
        const state = gameCoreStore.state();
        if (!state) {
          return [];
        }
        return rules.getDeployDestinations(state, state.activePlayerId, unitId, gameCoreStore.units());
      },
      /**
       * Surfaces a drag-and-drop drop that the map component detected as
       * illegal (dropTarget isn't in loadTargets/attackTargets/moveDestinations)
       * before ever reaching a command — there's no engine event to react
       * to, so this sets the same signal MovementRejected normally would.
       */
      reportInvalidDestination(): void {
        patchState(store, { movementRejectionReason: 'That is not a legal destination for this unit.' });
      },
      /**
       * Reacts to events fired by another store's dispatch that this store
       * still cares about — GameCoreStore's advancePhase()/endTurn()
       * (PhaseAdvanced/TurnEnded clear the stale banner) today, since those
       * don't go through this store's own dispatchAndHandle. Called by
       * GameStore's bridge alongside its own remaining applyEvents switch.
       */
      reactToEvents(events: readonly GameEngineEvent[]): void {
        handleEvents(events);
      },
    };
  }),
  withMethods((store) => {
    const gameCoreStore = inject(GameCoreStore);
    const mapUiStoreForActions = inject(MapUiStore);
    return {
    /**
     * Arms a click-to-place deploy: the map highlights every legal
     * destination for this Reserve unit, and the next canvas click on one
     * of them deploys it there (see resolvePendingActionAt).
     */
    armDeployUnit(unitId: string): void {
      mapUiStoreForActions.armPendingAction({
        kind: 'deploy',
        subjectId: unitId,
        destinations: store.deployDestinations(unitId),
      });
    },
    /** Arms a click-to-place unload: same flow as armDeployUnit, but for an embarked unit's disembark destinations. */
    armUnloadUnit(unitInstanceId: string): void {
      mapUiStoreForActions.armPendingAction({
        kind: 'unload',
        subjectId: unitInstanceId,
        destinations: store.unloadDestinations(unitInstanceId),
      });
    },
    /**
     * Resolves an armed deploy/unload against a clicked region or sea-zone
     * id (or null, e.g. empty ocean) — a click outside the highlighted
     * destinations just cancels quietly, same as clicking away from a
     * selection elsewhere in this app. Returns whether an action was
     * armed, so WorldMapComponent knows to skip its normal click handling
     * either way.
     */
    resolvePendingActionAt(targetId: string | null): boolean {
      const action = mapUiStoreForActions.pendingAction();
      if (!action) {
        return false;
      }
      const activePlayerId = gameCoreStore.state()?.activePlayerId;
      if (activePlayerId && targetId && action.destinations.includes(targetId)) {
        if (action.kind === 'deploy') {
          store.deployUnit(activePlayerId, action.subjectId, targetId);
        } else {
          store.unloadUnit(activePlayerId, action.subjectId, targetId);
        }
      }
      mapUiStoreForActions.clearPendingAction();
      return true;
    },
    /**
     * Starts a unit drag that originates outside the map canvas (e.g. a
     * unit card in RegionInfoPanelComponent) so it can be dropped onto a
     * region the same way a canvas-originated drag is — see
     * WorldMapComponent, which owns the actual region hit-testing once
     * this is armed. No-op for a unit that isn't the active player's, is
     * embarked, has no moves left, or if it's not currently a movement
     * phase (mirrors WorldMapComponent.tryPickUpUnit).
     */
    startExternalUnitDrag(unitInstanceId: string): void {
      const state = gameCoreStore.state();
      if (!state || !MOVEMENT_PHASES.includes(state.phase)) {
        return;
      }
      const unit = rules.getUnitInstance(state, unitInstanceId);
      if (!unit || unit.ownerId !== state.activePlayerId || unit.transportedBy !== null || unit.movesRemaining <= 0) {
        return;
      }
      const moveDestinations = store.legalMoveDestinations(unitInstanceId);
      const attackTargets = state.phase === 'attackMoves' ? store.legalAttackTargets(unitInstanceId) : [];
      const loadTargets = new Map<string, string>();
      for (const target of store.loadableTransportTargets(unitInstanceId)) {
        loadTargets.set(target.seaZoneId, target.transportId);
      }
      const drag: UnitDragState = {
        unitInstanceId,
        unitId: unit.unitId,
        originId: unit.regionId,
        moveDestinations,
        attackTargets,
        loadTargets,
      };
      mapUiStoreForActions.startExternalDrag(drag);
    },
    /** Resolves an in-progress external unit drag against a drop target (a region or sea-zone id, or null if dropped off-map), then clears the drag. */
    resolveExternalDrop(dropTargetId: string | null): void {
      const drag = mapUiStoreForActions.externalDrag();
      const activePlayerId = gameCoreStore.state()?.activePlayerId;
      if (drag && dropTargetId && activePlayerId) {
        const loadTransportId = drag.loadTargets.get(dropTargetId);
        if (loadTransportId) {
          store.loadUnit(activePlayerId, drag.unitInstanceId, loadTransportId);
        } else if (drag.attackTargets.includes(dropTargetId)) {
          store.attackRegion(activePlayerId, drag.unitInstanceId, dropTargetId);
        } else if (drag.moveDestinations.includes(dropTargetId)) {
          store.moveUnit(activePlayerId, drag.unitInstanceId, dropTargetId);
        } else {
          store.reportInvalidDestination();
        }
      }
      mapUiStoreForActions.endExternalDrag();
    },
    };
  }),
);
