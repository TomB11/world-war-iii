import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';
import { RulesEngine } from '../../engine/rules-engine';
import { RollAiPurchaseChartCommand } from '../../engine/commands/roll-ai-purchase-chart.command';
import { RollAiOrderCommand } from '../../engine/commands/roll-ai-order.command';
import { RollAiCyberActionCommand } from '../../engine/commands/roll-ai-cyber-action.command';
import { IncrementThreatCommand } from '../../engine/commands/increment-threat.command';
import { GrantFreeTreasuryCommand } from '../../engine/commands/grant-free-treasury.command';
import { GrantFreeUnitsCommand } from '../../engine/commands/grant-free-units.command';
import { AiFreeCyberAttackCommand } from '../../engine/commands/ai-free-cyber-attack.command';
import { AiSabotageCommand } from '../../engine/commands/ai-sabotage.command';
import { ApplyFreeMissileStrikeCommand } from '../../engine/commands/apply-free-missile-strike.command';
import { Command } from '../../interfaces/command';
import { GameEngineEvent } from '../../interfaces/game-events';
import { InitialGameData } from '../../services/data-loader.service';
import { AiPurchaseChartData } from '../../models/ai-purchase-chart.model';
import { AiOrderAction, AiOrderTableData } from '../../models/ai-order.model';
import { AiAttackConditionsData } from '../../models/ai-attack-conditions.model';
import { AiCyberAction, AiCyberActionTableData } from '../../models/ai-cyber-action.model';
import { AiThreatTrackData, ThreatThreshold } from '../../models/ai-threat-track.model';
import { AiDifficultyData, AiDifficultyPreset } from '../../models/ai-difficulty.model';
import { AiSabotageEffectsData } from '../../models/ai-sabotage.model';
import { AiTurnSummaryEntry } from '../../models/ai-turn-summary.model';
import { GameCoreStore } from '../core/game-core.store';
import { MapUiStore } from '../map/map-ui.store';
import { CyberAttackStore } from '../cyber/cyber-attack.store';

type StaticAiData = Pick<
  InitialGameData,
  'aiPurchaseChart' | 'aiOrderTable' | 'aiAttackConditions' | 'aiCyberActionTable' | 'aiThreatTrack' | 'aiDifficulty' | 'aiSabotageEffects'
>;

interface AiSlice {
  readonly aiPurchaseChart: AiPurchaseChartData | null;
  readonly aiOrderTable: AiOrderTableData | null;
  readonly aiAttackConditions: AiAttackConditionsData | null;
  readonly aiCyberActionTable: AiCyberActionTableData | null;
  readonly aiThreatTrack: AiThreatTrackData | null;
  readonly aiDifficulty: AiDifficultyData | null;
  readonly aiSabotageEffects: AiSabotageEffectsData | null;
  /** Set whenever RollAiCyberActionCommand resolves — read immediately after by AiTurnService. */
  readonly lastAiCyberAction: AiCyberAction | null;
  /** Set whenever IncrementThreatCommand resolves — read immediately after by AiTurnService to know which bonus (if any) to apply. */
  readonly lastThreatCrossedThreshold: ThreatThreshold | null;
  /** Set whenever RollAiPurchaseChartCommand resolves — read immediately after by AiTurnService to know what to buy. */
  readonly lastAiPurchaseChartUnitIds: readonly string[];
  /** Set whenever RollAiOrderCommand resolves — read immediately after (and again later during Attack Moves) by AiTurnService. */
  readonly lastAiOrderAction: AiOrderAction | null;
  /** Scratch buffer for the AI turn(s) currently in progress — accumulated by narrateAiAction, grouped into aiTurnSummary once AiTurnService.runAiTurns finishes (see beginAiTurnLog/finishAiTurnLog). */
  readonly aiTurnLogEntries: readonly { playerId: string; message: string }[];
  /** The completed, dismissable review of what every AI faction just did — null when there's nothing to show or the player already dismissed it. */
  readonly aiTurnSummary: readonly AiTurnSummaryEntry[] | null;
}

const initialState: AiSlice = {
  aiPurchaseChart: null,
  aiOrderTable: null,
  aiAttackConditions: null,
  aiCyberActionTable: null,
  aiThreatTrack: null,
  aiDifficulty: null,
  aiSabotageEffects: null,
  lastAiCyberAction: null,
  lastThreatCrossedThreshold: null,
  lastAiPurchaseChartUnitIds: [],
  lastAiOrderAction: null,
  aiTurnLogEntries: [],
  aiTurnSummary: null,
};

const rules = new RulesEngine();

/**
 * Everything Solo Command Mode-only (PROJECT_RULES.md sections 7-8):
 * static AI tuning data, the scratch signals AiTurnService reads back
 * immediately after each roll, the AI-only bonus commands (free treasury/
 * units/cyber attack/missile strike, sabotage), and the dismissable
 * per-faction turn summary. Replaces the Solo Command Mode slice of the old
 * monolithic `GameStore`.
 */
export const AiStore = signalStore(
  { providedIn: 'root' },
  withState(initialState),
  withComputed((store) => {
    const gameCoreStore = inject(GameCoreStore);
    return {
      /** Whether the active player is AI-controlled (Solo Command Mode) rather than human. */
      isActivePlayerAiControlled: computed(() => {
        const state = gameCoreStore.state();
        const player = gameCoreStore.activePlayer();
        if (!state || !player) {
          return false;
        }
        return rules.isAiControlled(state, player.id, gameCoreStore.factions());
      }),
      /** Solo Command Mode's difficulty preset for the current game (null in hotseat play), for AiTurnService's per-turn bonus and Nightmare's every-Nth-turn free cyber attack. */
      aiDifficultyPreset: computed<AiDifficultyPreset | null>(() => {
        const difficulty = gameCoreStore.state()?.aiConfig?.difficulty;
        if (!difficulty) {
          return null;
        }
        return store.aiDifficulty()?.presets[difficulty] ?? null;
      }),
    };
  }),
  withMethods((store) => {
    const gameCoreStore = inject(GameCoreStore);
    const mapUiStore = inject(MapUiStore);
    const cyberAttackStore = inject(CyberAttackStore);

    /**
     * Runs `command` through GameCoreStore.dispatch() and forwards the
     * resulting events to MapUiStore (AiSabotageResolved/FreeMissileStrikeResolved
     * both queue a map effect) and CyberAttackStore (AiSabotageCommand can
     * reject with the same CyberAttackRejected event a human hack/influence/
     * upgrade attempt would) — this store's dispatches bypass GameStore's
     * bridge entirely — before reacting to whatever this store itself owns.
     */
    function dispatchAndHandle(command: Command): void {
      const events = gameCoreStore.dispatch(command);
      mapUiStore.reactToEvents(events);
      cyberAttackStore.reactToEvents(events);
      handleEvents(events);
    }

    function handleEvents(events: readonly GameEngineEvent[]): void {
      for (const event of events) {
        switch (event.type) {
          case 'AiPurchaseChartRolled':
            patchState(store, { lastAiPurchaseChartUnitIds: event.unitIds });
            break;
          case 'AiOrderRolled':
            patchState(store, { lastAiOrderAction: event.action });
            break;
          case 'AiCyberActionRolled':
            patchState(store, { lastAiCyberAction: event.action });
            break;
          case 'ThreatIncreased':
            patchState(store, { lastThreatCrossedThreshold: event.crossedThreshold });
            break;
          default:
            break;
        }
      }
    }

    return {
      /** Stores the Solo Command Mode static tuning data returned by GameCoreStore.initialize() — called once by GameStore.initialize() right after it resolves. */
      setStaticAiData(data: StaticAiData): void {
        patchState(store, {
          aiPurchaseChart: data.aiPurchaseChart,
          aiOrderTable: data.aiOrderTable,
          aiAttackConditions: data.aiAttackConditions,
          aiCyberActionTable: data.aiCyberActionTable,
          aiThreatTrack: data.aiThreatTrack,
          aiDifficulty: data.aiDifficulty,
          aiSabotageEffects: data.aiSabotageEffects,
        });
      },
      /** Solo Command Mode only. Rolls the AI Purchase Chart; the resulting unit ids are read via lastAiPurchaseChartUnitIds() immediately after. */
      rollAiPurchaseChart(playerId: string): void {
        const purchaseChart = store.aiPurchaseChart();
        if (!purchaseChart) {
          return;
        }
        dispatchAndHandle(new RollAiPurchaseChartCommand(playerId, purchaseChart, rules));
      },
      /** Solo Command Mode only. Rolls this turn's AI Order; the result is read via lastAiOrderAction() immediately after. */
      rollAiOrder(playerId: string): void {
        const orderTable = store.aiOrderTable();
        if (!orderTable) {
          return;
        }
        dispatchAndHandle(new RollAiOrderCommand(playerId, orderTable, rules));
      },
      /** Solo Command Mode only. Rolls this turn's Cyber & Political Action; the result is read via lastAiCyberAction() immediately after. */
      rollAiCyberAction(playerId: string): void {
        const cyberActionTable = store.aiCyberActionTable();
        if (!cyberActionTable) {
          return;
        }
        dispatchAndHandle(new RollAiCyberActionCommand(playerId, cyberActionTable, rules));
      },
      /** Solo Command Mode only. Increments the shared AI Threat Track by 1; any newly-crossed threshold is read via lastThreatCrossedThreshold() immediately after. */
      incrementThreat(playerId: string): void {
        const threatTrackData = store.aiThreatTrack();
        if (!threatTrackData) {
          return;
        }
        dispatchAndHandle(new IncrementThreatCommand(playerId, threatTrackData, rules));
      },
      /** Solo Command Mode only. Credits treasury with no cost (Threat Track bonus / difficulty preset). */
      grantFreeTreasury(playerId: string, amount: number, reason: string): void {
        dispatchAndHandle(new GrantFreeTreasuryCommand(playerId, amount, reason, rules));
      },
      /** Solo Command Mode only. Adds units directly to Reserve with no cost (Threat Track bonus). */
      grantFreeUnits(playerId: string, unitId: string, quantity: number): void {
        dispatchAndHandle(new GrantFreeUnitsCommand(playerId, unitId, quantity, rules));
      },
      /** Solo Command Mode only. A bonus hack outside the normal Cyber Attack cost/slot (Threat Track / Nightmare difficulty). */
      freeCyberAttack(playerId: string, targetPlayerId: string): void {
        dispatchAndHandle(new AiFreeCyberAttackCommand(playerId, targetPlayerId, rules));
      },
      /** Solo Command Mode only. Resolves a Sabotage action against targetPlayerId, using targetRegionId (its richest region) for the "block one region's factory" effect. */
      aiSabotage(playerId: string, targetPlayerId: string, targetRegionId: string): void {
        const economyConfig = gameCoreStore.economyConfig();
        const sabotageEffects = store.aiSabotageEffects();
        if (!economyConfig || !sabotageEffects) {
          return;
        }
        dispatchAndHandle(
          new AiSabotageCommand(
            playerId,
            targetPlayerId,
            targetRegionId,
            economyConfig,
            sabotageEffects,
            gameCoreStore.factions(),
            rules,
          ),
        );
      },
      /** Solo Command Mode only. Threat Track's free missile strike bonus — a stand-alone bombardment of targetRegionId. */
      applyFreeMissileStrike(playerId: string, targetRegionId: string): void {
        dispatchAndHandle(new ApplyFreeMissileStrikeCommand(playerId, targetRegionId, gameCoreStore.units(), rules));
      },
      /**
       * Solo Command Mode only: called by AiTurnService to record one AI
       * faction's action into the current turn-log buffer (see
       * beginAiTurnLog/finishAiTurnLog), later shown to the human as a single
       * dismissable review — not as toasts. Recorded directly rather than
       * derived from a GameEngineEvent, since AiTurnService already knows the
       * real outcome of its own dispatches (e.g. which purchases actually
       * succeeded) — re-deriving that from events fired mid-turn would risk
       * narrating an action that was actually rejected.
       */
      narrateAiAction(playerId: string, message: string): void {
        patchState(store, { aiTurnLogEntries: [...store.aiTurnLogEntries(), { playerId, message }] });
      },
      /** Starts a fresh turn-log buffer — called by AiTurnService right before it starts driving a new chain of consecutive AI factions' turns. */
      beginAiTurnLog(): void {
        patchState(store, { aiTurnLogEntries: [] });
      },
      /**
       * Groups the buffered turn-log entries by faction into the dismissable
       * summary the human reviews (AiStore.aiTurnSummary), preserving the
       * order factions first acted in. Leaves aiTurnSummary untouched if no AI
       * faction narrated anything this chain (nothing worth interrupting the
       * player to review) — called by AiTurnService once every consecutive AI
       * faction in the chain has finished its turn.
       */
      finishAiTurnLog(): void {
        const entries = store.aiTurnLogEntries();
        if (entries.length === 0) {
          return;
        }
        const state = gameCoreStore.state();
        const factions = gameCoreStore.factions();
        const order: string[] = [];
        const byPlayer = new Map<string, string[]>();
        for (const entry of entries) {
          if (!byPlayer.has(entry.playerId)) {
            byPlayer.set(entry.playerId, []);
            order.push(entry.playerId);
          }
          byPlayer.get(entry.playerId)?.push(entry.message);
        }
        const summary: AiTurnSummaryEntry[] = order.map((playerId) => {
          const player = state?.players.find((candidate) => candidate.id === playerId);
          return {
            playerId,
            playerName: player?.displayName ?? playerId,
            color: factions[player?.factionId ?? '']?.color ?? '#8896a8',
            actions: byPlayer.get(playerId) ?? [],
          };
        });
        patchState(store, { aiTurnSummary: summary });
      },
      /** Dismisses the AI turn summary modal (Solo Command Mode's "Pokračovať" button). */
      dismissAiTurnSummary(): void {
        patchState(store, { aiTurnSummary: null });
      },
    };
  }),
);
