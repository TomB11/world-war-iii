import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';
import { RulesEngine } from '../../engine/rules-engine';
import { RollCombatCommand } from '../../engine/commands/roll-combat.command';
import { SelectMissileCommand } from '../../engine/commands/select-missile.command';
import { FireMissileCommand } from '../../engine/commands/fire-missile.command';
import { RemoveCasualtyCommand } from '../../engine/commands/remove-casualty.command';
import { Command } from '../../interfaces/command';
import { GameEngineEvent } from '../../interfaces/game-events';
import { RegionCombat } from '../../models/region-combat.model';
import { GameCoreStore } from '../core/game-core.store';
import { MapUiStore } from '../map/map-ui.store';
import { clearsAllRejectionBanners } from '../shared/rejection-event-routing';

interface CombatSlice {
  readonly combatRegionId: string | null;
  readonly combatRejectionReason: string | null;
  readonly combatOutcomeMessage: string | null;
  readonly missileStrikeMessage: string | null;
}

const initialState: CombatSlice = {
  combatRegionId: null,
  combatRejectionReason: null,
  combatOutcomeMessage: null,
  missileStrikeMessage: null,
};

const rules = new RulesEngine();

/**
 * The Attack Phase combat board (PROJECT_RULES.md sections 9-15): which
 * region/sea-zone's battle is currently open, its rejection/outcome
 * messages, and the dice-roll/missile/casualty actions that drive one round
 * at a time. Replaces the combat slice of the old monolithic `GameStore`.
 */
export const CombatStore = signalStore(
  { providedIn: 'root' },
  withState(initialState),
  withComputed((store) => {
    const gameCoreStore = inject(GameCoreStore);
    return {
      /**
       * The RegionCombat currently open in the combat board modal, or null
       * if none is open. A battle's first RegionCombat entry isn't written
       * to state until the player's first action there
       * (RollCombatCommand/SelectMissileCommand both lazily materialize it
       * via RulesEngine.createInitialCombat) — but the modal needs to show
       * the correct starting step (missile choice vs. a normal attacker
       * roll) the instant it opens, before any action has been taken. So
       * this falls back to the same createInitialCombat query (a read-only
       * RulesEngine call, safe to use for display) rather than null.
       */
      activeCombat: computed<RegionCombat | null>(() => {
        const state = gameCoreStore.state();
        const regionId = store.combatRegionId();
        const playerId = gameCoreStore.activePlayer()?.id;
        if (!state || !regionId || !playerId) {
          return null;
        }
        return state.combats[regionId] ?? rules.createInitialCombat(state, regionId, playerId, gameCoreStore.units());
      }),
    };
  }),
  withMethods((store) => {
    const gameCoreStore = inject(GameCoreStore);
    const mapUiStore = inject(MapUiStore);

    /**
     * Runs `command` through GameCoreStore.dispatch() and forwards the
     * resulting events to MapUiStore (this store's own dispatches bypass
     * GameStore's bridge entirely, so nobody else would ever queue the
     * casualty-explosion/combat-outcome map effects otherwise) before
     * reacting to whatever this store itself owns.
     */
    function dispatchAndHandle(command: Command): void {
      const events = gameCoreStore.dispatch(command);
      mapUiStore.reactToEvents(events);
      handleEvents(events);
    }

    /** Reacts to events this store owns, whether they came from this store's own dispatch or another (not-yet-migrated) store's — see reactToEvents doc. */
    function handleEvents(events: readonly GameEngineEvent[]): void {
      for (const event of events) {
        switch (event.type) {
          case 'MissileStrikeDeclared': {
            const regionName = gameCoreStore.regions()[event.regionId]?.name ?? event.regionId;
            patchState(store, { missileStrikeMessage: `Missile strike declared on ${regionName}.` });
            break;
          }
          case 'CombatRejected':
            patchState(store, { combatRejectionReason: event.reason });
            break;
          case 'CombatRoundRolled':
            patchState(store, { combatRejectionReason: null });
            break;
          case 'CasualtyRemoved':
            patchState(store, { combatRejectionReason: null });
            break;
          case 'RegionCombatResolved': {
            // A sea zone isn't ownable — "captured" there means "won the naval
            // battle" (the enemy fleet was destroyed), not a territory flip.
            const isNaval = gameCoreStore.seaZones()[event.regionId] !== undefined;
            const message = isNaval
              ? event.captured
                ? 'Enemy fleet destroyed!'
                : 'Your fleet was destroyed.'
              : event.captured
                ? 'Region captured!'
                : 'Attack failed — the region stays with its current owner.';
            patchState(store, { combatRejectionReason: null, combatOutcomeMessage: message });
            break;
          }
          default:
            if (clearsAllRejectionBanners(event)) {
              patchState(store, { combatRejectionReason: null });
            }
        }
      }
    }

    return {
      /** Opens the combat board modal for a contested region (PROJECT_RULES.md sections 9-14). */
      openCombat(regionId: string): void {
        patchState(store, { combatRegionId: regionId, combatOutcomeMessage: null, combatRejectionReason: null });
      },
      closeCombat(): void {
        patchState(store, { combatRegionId: null, combatOutcomeMessage: null });
      },
      /** Rolls the next round of dice for whichever side is up in a region's Attack Phase battle. */
      rollCombat(playerId: string, regionId: string): void {
        dispatchAndHandle(new RollCombatCommand(playerId, regionId, gameCoreStore.units(), rules));
      },
      /** Arms one Reserve missile for a pending strike (PROJECT_RULES.md section 15) — first of two clicks; see fireMissile for the roll itself. */
      selectMissile(playerId: string, regionId: string, missileUnitId: string): void {
        dispatchAndHandle(new SelectMissileCommand(playerId, regionId, missileUnitId, gameCoreStore.units(), rules));
      },
      /** Rolls the missile armed via selectMissile() — resolves interception/hit and removes it from Reserve either way (PROJECT_RULES.md section 15). */
      fireMissile(playerId: string, regionId: string): void {
        dispatchAndHandle(new FireMissileCommand(playerId, regionId, gameCoreStore.units(), rules));
      },
      /** Removes one unit as a casualty during a region's Attack Phase battle. */
      removeCasualty(playerId: string, regionId: string, unitInstanceId: string): void {
        const economyConfig = gameCoreStore.economyConfig();
        if (!economyConfig) {
          return;
        }
        dispatchAndHandle(
          new RemoveCasualtyCommand(playerId, regionId, unitInstanceId, gameCoreStore.units(), economyConfig, rules),
        );
      },
      /**
       * Reacts to events fired by another (not-yet-migrated) store's
       * dispatch that this store still cares about — today, just
       * `MissileStrikeDeclared` from AttackCommand (declaring a Rocket
       * System strike happens during Attack Moves, dispatched by whichever
       * store owns `attackRegion`). Called by GameStore's bridge alongside
       * its own remaining applyEvents switch.
       */
      reactToEvents(events: readonly GameEngineEvent[]): void {
        handleEvents(events);
      },
    };
  }),
);
