import { inject } from '@angular/core';
import { patchState, signalStore, withMethods, withState } from '@ngrx/signals';
import { RulesEngine } from '../../engine/rules-engine';
import { PurchaseUnitCommand } from '../../engine/commands/purchase-unit.command';
import { RaiseCitizenSatisfactionCommand } from '../../engine/commands/raise-citizen-satisfaction.command';
import { GameEngineEvent } from '../../interfaces/game-events';
import { GameCoreStore } from '../core/game-core.store';
import { clearsAllRejectionBanners } from '../shared/rejection-event-routing';

interface EconomySlice {
  readonly purchaseRejectionReason: string | null;
  readonly publicSpendingRejectionReason: string | null;
}

const initialState: EconomySlice = {
  purchaseRejectionReason: null,
  publicSpendingRejectionReason: null,
};

const rules = new RulesEngine();

/**
 * Buy Units + Public Spending (PROJECT_RULES.md sections 4/5): purchasing
 * Reserve units and spending treasury to raise Citizen Satisfaction.
 * Replaces the economy slice of the old monolithic `GameStore`.
 */
export const EconomyStore = signalStore(
  { providedIn: 'root' },
  withState(initialState),
  withMethods((store) => {
    const gameCoreStore = inject(GameCoreStore);

    function handleEvents(events: readonly GameEngineEvent[]): void {
      for (const event of events) {
        switch (event.type) {
          case 'PurchaseRejected':
            patchState(store, { purchaseRejectionReason: event.reason });
            break;
          case 'PublicSpendingRejected':
            patchState(store, { publicSpendingRejectionReason: event.reason });
            break;
          default:
            if (clearsAllRejectionBanners(event)) {
              patchState(store, { purchaseRejectionReason: null, publicSpendingRejectionReason: null });
            }
        }
      }
    }

    return {
      purchaseUnit(playerId: string, unitId: string, quantity: number): void {
        const events = gameCoreStore.dispatch(new PurchaseUnitCommand(playerId, unitId, quantity, gameCoreStore.units(), rules));
        handleEvents(events);
      },
      /** Public Spending (PROJECT_RULES.md section 5): spend treasury to raise the active player's own Citizen Satisfaction. */
      raiseCitizenSatisfaction(playerId: string, amount: number): void {
        const economyConfig = gameCoreStore.economyConfig();
        if (!economyConfig) {
          return;
        }
        const events = gameCoreStore.dispatch(
          new RaiseCitizenSatisfactionCommand(playerId, amount, economyConfig, rules),
        );
        handleEvents(events);
      },
      /**
       * Reacts to events fired by another store's dispatch (e.g.
       * PhaseAdvanced/TurnEnded from GameCoreStore.advancePhase()/endTurn())
       * that should clear a stale banner here too. Called by GameStore's
       * bridge alongside its own remaining applyEvents switch.
       */
      reactToEvents(events: readonly GameEngineEvent[]): void {
        handleEvents(events);
      },
    };
  }),
);
