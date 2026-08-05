import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';
import { GameEngine } from '../../engine/game-engine';
import { RulesEngine } from '../../engine/rules-engine';
import { Command } from '../../interfaces/command';
import { GameEngineEvent } from '../../interfaces/game-events';
import { GameState } from '../../models/game-state.model';
import { Region } from '../../models/region.model';
import { SeaZone } from '../../models/sea-zone.model';
import { Faction } from '../../models/faction.model';
import { UnitDefinition } from '../../models/unit.model';
import { UnitInstance } from '../../models/unit-instance.model';
import { PlayerState } from '../../models/player.model';
import { EconomyConfig } from '../../models/economy-config.model';
import { AdvancePhaseCommand } from '../../engine/commands/advance-phase.command';
import { EndTurnCommand } from '../../engine/commands/end-turn.command';
import { GrantFreeTreasuryCommand } from '../../engine/commands/grant-free-treasury.command';
import { DataLoaderService, InitialGameData } from '../../services/data-loader.service';
import { RandomService } from '../../services/random.service';
import { SoloSetupStore } from '../solo-setup/solo-setup.store';
import { clearsAllRejectionBanners } from '../shared/rejection-event-routing';

interface GameCoreSlice {
  readonly state: GameState | null;
  readonly loadError: string | null;
  readonly factions: Readonly<Record<string, Faction>>;
  readonly units: Readonly<Record<string, UnitDefinition>>;
  readonly economyConfig: EconomyConfig | null;
  readonly phaseAdvanceRejectionReason: string | null;
}

const initialState: GameCoreSlice = {
  state: null,
  loadError: null,
  factions: {},
  units: {},
  economyConfig: null,
  phaseAdvanceRejectionReason: null,
};

/** Shared by every computed/method below — pure, stateless query classes (CODING_STANDARTS.txt §5), safe to share across the whole store's lifetime. */
const rules = new RulesEngine();
const engine = new GameEngine(rules);

/**
 * The authoritative GameState + the turn-cycle primitives every other
 * feature store depends on (PROJECT_STRUCTURE.md §2, CODING_STANDARTS.txt
 * §11: "UI -> Command -> Engine -> State Update -> UI refresh"). Replaces
 * `state/game.state.ts`'s `GameStateSignal` plus the shared/derived slice of
 * the old monolithic `GameStore`.
 *
 * `dispatch()` is the one place `GameEngine.execute()` is called and the
 * core `GameState` is patched — every other feature store's action methods
 * call `this.gameCoreStore.dispatch(command)` and react to the *returned*
 * events for their own concern (see state/shared/rejection-event-routing.ts
 * for the shared "clear stale rejection banners" convention). Components
 * never call `dispatch` directly — only via a feature store's named verb
 * method, exactly as they only ever called a named `GameStore` method
 * before this split.
 */
export const GameCoreStore = signalStore(
  { providedIn: 'root' },
  withState(initialState),
  withComputed((store) => ({
    regions: computed<Readonly<Record<string, Region>>>(() => store.state()?.regions ?? {}),
    seaZones: computed<Readonly<Record<string, SeaZone>>>(() => store.state()?.seaZones ?? {}),
    isLoaded: computed(() => store.state() !== null),
    activePlayer: computed<PlayerState | null>(() => {
      const state = store.state();
      if (!state) {
        return null;
      }
      return state.players.find((player) => player.id === state.activePlayerId) ?? null;
    }),
    unitsByRegion: computed<Readonly<Record<string, readonly UnitInstance[]>>>(() => {
      const state = store.state();
      if (!state) {
        return {};
      }
      const map: Record<string, UnitInstance[]> = {};
      for (const unit of state.units) {
        (map[unit.regionId] ??= []).push(unit);
      }
      return map;
    }),
    /** Live-derived win check (PROJECT_RULES.md section 2) — solo checked before team so a faction that alone clears both thresholds reports as the more specific solo winner. */
    victoryStatus: computed<{ readonly winnerId: string; readonly type: 'solo' | 'team'; readonly starCount: number } | null>(
      () => {
        const state = store.state();
        const economyConfig = store.economyConfig();
        if (!state || !economyConfig) {
          return null;
        }
        const factions = store.factions();

        for (const player of state.players) {
          const count = rules.getVictoryStarCount(state, player.id);
          if (count >= economyConfig.soloVictoryStarCount) {
            return { winnerId: player.id, type: 'solo', starCount: count };
          }
        }

        const teamCounts = new Map<string, number>();
        for (const player of state.players) {
          const teamId = factions[player.factionId]?.teamId;
          if (!teamId) {
            continue;
          }
          const count = rules.getVictoryStarCount(state, player.id);
          teamCounts.set(teamId, (teamCounts.get(teamId) ?? 0) + count);
        }
        for (const [teamId, count] of teamCounts) {
          if (count >= economyConfig.teamVictoryStarCount) {
            return { winnerId: teamId, type: 'team', starCount: count };
          }
        }
        return null;
      },
    ),
    /** Maps each region to its current owner's flag image path (or the neutral flag), for WorldMapComponent to draw over the map background. */
    regionFlagPaths: computed<Readonly<Record<string, string>>>(() => {
      const state = store.state();
      if (!state) {
        return {};
      }
      const paths: Record<string, string> = {};
      for (const region of Object.values(state.regions)) {
        paths[region.id] = region.ownerId ? `assets/flags/${region.ownerId}.png` : 'assets/flags/neutral.png';
      }
      return paths;
    }),
  })),
  withComputed((store) => ({
    /** Read-only preview of the active player's income (CODING_STANDARDS.md section 3) — purely informational, income is credited automatically (see EndTurnCommand). */
    projectedIncome: computed(() => {
      const state = store.state();
      const player = store.activePlayer();
      if (!state || !player) {
        return 0;
      }
      return rules.calculateIncome(state, player.id);
    }),
    /** Deployed units belonging to the active player, for the Movement panel. */
    activePlayerUnits: computed<readonly UnitInstance[]>(() => {
      const state = store.state();
      const player = store.activePlayer();
      if (!state || !player) {
        return [];
      }
      return state.units.filter((unit) => unit.ownerId === player.id);
    }),
  })),
  withMethods((store) => ({
    /**
     * Runs `command` through the Game Engine, patches the core `GameState`,
     * and returns the resulting events synchronously so the calling store
     * can react to whichever ones it owns. Store-internal API — see this
     * store's class doc comment.
     */
    dispatch(command: Command): readonly GameEngineEvent[] {
      const currentState = store.state();
      if (!currentState) {
        return [];
      }
      const result = engine.execute(currentState, command);
      patchState(store, { state: result.state });
      for (const event of result.events) {
        if (event.type === 'PhaseAdvanceRejected') {
          patchState(store, { phaseAdvanceRejectionReason: event.reason });
        } else if (clearsAllRejectionBanners(event)) {
          patchState(store, { phaseAdvanceRejectionReason: null });
        }
      }
      return result.events;
    },
  })),
  withMethods((store) => {
    const dataLoader = inject(DataLoaderService);
    const randomService = inject(RandomService);
    const soloSetup = inject(SoloSetupStore);
    return {
      /** Whether this unit actually fights in combat (embarked land/support cargo rides along but never rolls dice — see RulesEngine.isCombatParticipant). */
      isCombatParticipant(unit: UnitInstance): boolean {
        return rules.isCombatParticipant(unit, store.units());
      },
      /** Whether two players are hostile to each other (different teams, PROJECT_RULES.md section 2) rather than teammates. */
      isHostileTo(playerIdA: string, playerIdB: string): boolean {
        const state = store.state();
        if (!state) {
          return false;
        }
        return rules.isHostileTo(state, playerIdA, playerIdB, store.factions());
      },
      advancePhase(playerId: string): readonly GameEngineEvent[] {
        return store.dispatch(new AdvancePhaseCommand(playerId, store.units(), store.factions(), rules));
      },
      endTurn(playerId: string): readonly GameEngineEvent[] {
        const economyConfig = store.economyConfig();
        if (!economyConfig) {
          return [];
        }
        return store.dispatch(new EndTurnCommand(playerId, economyConfig, store.factions(), store.units(), rules));
      },
      /**
       * Loads all static game data + builds the very first GameState (via
       * DataLoaderService, seeded into RandomService for determinism),
       * applies Solo Command Mode's one-time difficulty starting-treasury
       * adjustment (e.g. Easy's -5) for each AI-controlled player, and
       * returns the full load result so the caller (today: GameStore's
       * bridge; eventually: a not-yet-built AiStore) can pick out whatever
       * Solo Command Mode-only static data it still needs — this store only
       * keeps the core slice (state/factions/units/economyConfig) for
       * itself. Returns null on failure (loadError is set either way).
       */
      async initialize(): Promise<InitialGameData | null> {
        try {
          const data = await dataLoader.loadInitialGameData(soloSetup.selection());
          randomService.seed(data.gameState.randomSeed);

          const factionMap: Record<string, Faction> = {};
          for (const faction of data.factions) {
            factionMap[faction.id] = faction;
          }

          patchState(store, {
            state: data.gameState,
            factions: factionMap,
            units: data.units,
            economyConfig: data.economyConfig,
          });

          if (data.gameState.aiConfig) {
            const preset = data.aiDifficulty.presets[data.gameState.aiConfig.difficulty];
            if (preset && preset.startingTreasuryDelta !== 0) {
              for (const player of data.gameState.players) {
                if (rules.isAiControlled(data.gameState, player.id, factionMap)) {
                  store.dispatch(
                    new GrantFreeTreasuryCommand(
                      player.id,
                      preset.startingTreasuryDelta,
                      `Difficulty: ${data.gameState.aiConfig.difficulty}`,
                      rules,
                    ),
                  );
                }
              }
            }
          }

          return data;
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Failed to load game data';
          patchState(store, { loadError: message });
          return null;
        }
      },
    };
  }),
);
