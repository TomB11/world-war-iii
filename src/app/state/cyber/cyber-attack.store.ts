import { inject } from '@angular/core';
import { patchState, signalStore, withMethods, withState } from '@ngrx/signals';
import { RulesEngine } from '../../engine/rules-engine';
import { HackCommand } from '../../engine/commands/hack.command';
import { PoliticalInfluenceCommand } from '../../engine/commands/political-influence.command';
import { UpgradeHackLevelCommand } from '../../engine/commands/upgrade-hack-level.command';
import { Command } from '../../interfaces/command';
import { GameEngineEvent } from '../../interfaces/game-events';
import { GameCoreStore } from '../core/game-core.store';
import { MapUiStore } from '../map/map-ui.store';
import { clearsAllRejectionBanners } from '../shared/rejection-event-routing';

interface CyberAttackSlice {
  readonly cyberAttackRejectionReason: string | null;
  readonly cyberAttackResultMessage: string | null;
}

const initialState: CyberAttackSlice = {
  cyberAttackRejectionReason: null,
  cyberAttackResultMessage: null,
};

const rules = new RulesEngine();

/**
 * Human-facing Cyber Attack Phase actions (PROJECT_RULES.md section 6):
 * Hacking, Political Influence, and Hack Level upgrades. Replaces the cyber
 * attack slice of the old monolithic `GameStore`.
 */
export const CyberAttackStore = signalStore(
  { providedIn: 'root' },
  withState(initialState),
  withMethods((store) => {
    const gameCoreStore = inject(GameCoreStore);
    const mapUiStore = inject(MapUiStore);

    /**
     * Runs `command` through GameCoreStore.dispatch() and forwards the
     * resulting events to MapUiStore (HackResolved/PoliticalInfluenceResolved
     * both queue a glitch map effect, and this store's dispatches bypass
     * GameStore's bridge entirely) before reacting to whatever this store
     * itself owns.
     */
    function dispatchAndHandle(command: Command): void {
      const events = gameCoreStore.dispatch(command);
      mapUiStore.reactToEvents(events);
      handleEvents(events);
    }

    function handleEvents(events: readonly GameEngineEvent[]): void {
      for (const event of events) {
        switch (event.type) {
          case 'CyberAttackRejected':
            patchState(store, { cyberAttackRejectionReason: event.reason });
            break;
          case 'HackResolved':
            patchState(store, {
              cyberAttackRejectionReason: null,
              cyberAttackResultMessage: event.succeeded
                ? `Hack succeeded (rolled ${event.attackRoll}) — stole ${event.moneyStolen} money.`
                : `Hack failed (rolled ${event.attackRoll}).`,
            });
            break;
          case 'PoliticalInfluenceResolved':
            patchState(store, {
              cyberAttackRejectionReason: null,
              cyberAttackResultMessage: !event.succeeded
                ? `Political Influence failed (rolled ${event.roll}).`
                : event.capturedRegion
                  ? `Political Influence succeeded (rolled ${event.roll}) — region captured!`
                  : `Political Influence succeeded (rolled ${event.roll}) — token placed.`,
            });
            break;
          case 'HackLevelUpgraded':
            patchState(store, {
              cyberAttackRejectionReason: null,
              cyberAttackResultMessage: `Hack Level upgraded to ${event.hackLevel}.`,
            });
            break;
          default:
            if (clearsAllRejectionBanners(event)) {
              patchState(store, { cyberAttackRejectionReason: null });
            }
        }
      }
    }

    return {
      /** Hacking (PROJECT_RULES.md section 6): attempt to steal treasury from another player during the Cyber Attack Phase. */
      hack(playerId: string, targetPlayerId: string): void {
        const economyConfig = gameCoreStore.economyConfig();
        if (!economyConfig) {
          return;
        }
        dispatchAndHandle(new HackCommand(playerId, targetPlayerId, economyConfig, gameCoreStore.factions(), rules));
      },
      /** Political Influence (PROJECT_RULES.md section 6): attempt to place an influence token on a neutral region. */
      politicalInfluence(playerId: string, targetRegionId: string): void {
        const economyConfig = gameCoreStore.economyConfig();
        if (!economyConfig) {
          return;
        }
        dispatchAndHandle(new PoliticalInfluenceCommand(playerId, targetRegionId, economyConfig, rules));
      },
      /** Upgrade Hack Level (PROJECT_RULES.md section 6): also a Cyber Attack Phase action, shares the once-per-turn slot. */
      upgradeHackLevel(playerId: string): void {
        const economyConfig = gameCoreStore.economyConfig();
        if (!economyConfig) {
          return;
        }
        dispatchAndHandle(new UpgradeHackLevelCommand(playerId, economyConfig, rules));
      },
      /**
       * Reacts to events fired by another store's dispatch that should clear
       * a stale banner here too. Called by GameStore's bridge alongside its
       * own remaining applyEvents switch.
       */
      reactToEvents(events: readonly GameEngineEvent[]): void {
        handleEvents(events);
      },
    };
  }),
);
