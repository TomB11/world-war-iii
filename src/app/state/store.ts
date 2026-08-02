import { Injectable, computed, inject, signal } from '@angular/core';
import { DataLoaderService } from '../services/data-loader.service';
import { RandomService } from '../services/random.service';
import { GameEngine } from '../engine/game-engine';
import { Command } from '../interfaces/command';
import { SelectRegionCommand } from '../engine/commands/select-region.command';
import { PurchaseUnitCommand } from '../engine/commands/purchase-unit.command';
import { AdvancePhaseCommand } from '../engine/commands/advance-phase.command';
import { EndTurnCommand } from '../engine/commands/end-turn.command';
import { DeployUnitCommand } from '../engine/commands/deploy-unit.command';
import { MoveUnitCommand } from '../engine/commands/move-unit.command';
import { LoadUnitCommand } from '../engine/commands/load-unit.command';
import { UnloadUnitCommand } from '../engine/commands/unload-unit.command';
import { AttackCommand } from '../engine/commands/attack.command';
import { RaiseCitizenSatisfactionCommand } from '../engine/commands/raise-citizen-satisfaction.command';
import { HackCommand } from '../engine/commands/hack.command';
import { PoliticalInfluenceCommand } from '../engine/commands/political-influence.command';
import { UpgradeHackLevelCommand } from '../engine/commands/upgrade-hack-level.command';
import { RollCombatCommand } from '../engine/commands/roll-combat.command';
import { SelectMissileCommand } from '../engine/commands/select-missile.command';
import { FireMissileCommand } from '../engine/commands/fire-missile.command';
import { RemoveCasualtyCommand } from '../engine/commands/remove-casualty.command';
import { RollAiPurchaseChartCommand } from '../engine/commands/roll-ai-purchase-chart.command';
import { RollAiOrderCommand } from '../engine/commands/roll-ai-order.command';
import { RollAiCyberActionCommand } from '../engine/commands/roll-ai-cyber-action.command';
import { IncrementThreatCommand } from '../engine/commands/increment-threat.command';
import { GrantFreeTreasuryCommand } from '../engine/commands/grant-free-treasury.command';
import { GrantFreeUnitsCommand } from '../engine/commands/grant-free-units.command';
import { AiFreeCyberAttackCommand } from '../engine/commands/ai-free-cyber-attack.command';
import { AiSabotageCommand } from '../engine/commands/ai-sabotage.command';
import { ApplyFreeMissileStrikeCommand } from '../engine/commands/apply-free-missile-strike.command';
import { GameEngineEvent } from '../interfaces/game-events';
import { Faction } from '../models/faction.model';
import { UnitDefinition } from '../models/unit.model';
import { UnitInstance } from '../models/unit-instance.model';
import { EconomyConfig } from '../models/economy-config.model';
import { AiPurchaseChartData } from '../models/ai-purchase-chart.model';
import { AiOrderAction, AiOrderTableData } from '../models/ai-order.model';
import { AiAttackConditionsData } from '../models/ai-attack-conditions.model';
import { AiCyberAction, AiCyberActionTableData } from '../models/ai-cyber-action.model';
import { AiThreatTrackData, ThreatThreshold } from '../models/ai-threat-track.model';
import { AiDifficultyData, AiDifficultyPreset } from '../models/ai-difficulty.model';
import { AiSabotageEffectsData } from '../models/ai-sabotage.model';
import { RegionCombat } from '../models/region-combat.model';
import { AiTurnSummaryEntry } from '../models/ai-turn-summary.model';
import { FlagTransitionQueueEntry, MapEffectEvent, MissileFiredQueueEntry, UnitMoveQueueEntry } from '../interfaces/map-types';
import { GameStateSignal } from './game.state';
import { MapUiState } from './map.state';
import { SoloSetupState } from './solo-setup.state';
import { MOVEMENT_PHASES } from '../core/constants/game.constants';

/**
 * Public facade for the whole state layer. Components only ever call
 * methods on GameStore — never touch GameEngine, GameStateSignal, or
 * MapUiState directly. This is the single enforcement point for
 * "UI -> Command -> Engine -> State -> UI refresh"
 * (PROJECT_STRUCTURE.md section 2, CODING_STANDARDS.md section 11).
 */
@Injectable({ providedIn: 'root' })
export class GameStore {
  private readonly dataLoader = inject(DataLoaderService);
  private readonly randomService = inject(RandomService);
  private readonly gameState = inject(GameStateSignal);
  private readonly mapUi = inject(MapUiState);
  private readonly soloSetup = inject(SoloSetupState);

  private readonly engine = new GameEngine();
  private readonly _factions = signal<Readonly<Record<string, Faction>>>({});
  private readonly _units = signal<Readonly<Record<string, UnitDefinition>>>({});
  private readonly _economyConfig = signal<EconomyConfig | null>(null);
  private readonly _purchaseRejectionReason = signal<string | null>(null);
  private readonly _movementRejectionReason = signal<string | null>(null);
  private readonly _publicSpendingRejectionReason = signal<string | null>(null);
  private readonly _cyberAttackRejectionReason = signal<string | null>(null);
  private readonly _cyberAttackResultMessage = signal<string | null>(null);
  private readonly _combatRejectionReason = signal<string | null>(null);
  private readonly _combatOutcomeMessage = signal<string | null>(null);
  private readonly _phaseAdvanceRejectionReason = signal<string | null>(null);
  private readonly _combatRegionId = signal<string | null>(null);
  private readonly _missileStrikeMessage = signal<string | null>(null);
  private readonly _aiPurchaseChart = signal<AiPurchaseChartData | null>(null);
  private readonly _aiOrderTable = signal<AiOrderTableData | null>(null);
  private readonly _aiAttackConditions = signal<AiAttackConditionsData | null>(null);
  private readonly _aiCyberActionTable = signal<AiCyberActionTableData | null>(null);
  private readonly _aiThreatTrack = signal<AiThreatTrackData | null>(null);
  private readonly _aiDifficulty = signal<AiDifficultyData | null>(null);
  private readonly _aiSabotageEffects = signal<AiSabotageEffectsData | null>(null);
  /** Set by applyEvents whenever RollAiCyberActionCommand resolves — read immediately after by AiTurnService. */
  private readonly _lastAiCyberAction = signal<AiCyberAction | null>(null);
  /** Set by applyEvents whenever IncrementThreatCommand resolves — read immediately after by AiTurnService to know which bonus (if any) to apply. */
  private readonly _lastThreatCrossedThreshold = signal<ThreatThreshold | null>(null);
  /** Set by applyEvents whenever RollAiPurchaseChartCommand resolves — read immediately after by AiTurnService to know what to buy. */
  private readonly _lastAiPurchaseChartUnitIds = signal<readonly string[]>([]);
  /** Set by applyEvents whenever RollAiOrderCommand resolves — read immediately after (and again later during Attack Moves) by AiTurnService. */
  private readonly _lastAiOrderAction = signal<AiOrderAction | null>(null);
  /** Scratch buffer for the AI turn(s) currently in progress — accumulated by narrateAiAction, grouped into _aiTurnSummary once AiTurnService.runAiTurns finishes (see beginAiTurnLog/finishAiTurnLog). */
  private readonly _aiTurnLogEntries = signal<readonly { playerId: string; message: string }[]>([]);
  /** The completed, dismissable review of what every AI faction just did — null when there's nothing to show or the player already dismissed it. */
  private readonly _aiTurnSummary = signal<readonly AiTurnSummaryEntry[] | null>(null);
  /** Rolling queue of attack/casualty/cyber/deploy moments for WorldMapComponent to animate as an explosion/glitch/spawn burst (ui/map/rendering/effects-renderer.ts) — capped so a long game never grows this unboundedly; WorldMapComponent tracks which ids it has already turned into a local effect. */
  private readonly _mapEffectEvents = signal<readonly MapEffectEvent[]>([]);
  private nextMapEffectId = 1;
  /** Rolling queue of unit moves for WorldMapComponent to animate as a sliding icon instead of an instant pop (ui/map/rendering/unit-move-renderer.ts). */
  private readonly _unitMoveEvents = signal<readonly UnitMoveQueueEntry[]>([]);
  private nextUnitMoveId = 1;
  /** Rolling queue of missile fires for WorldMapComponent to animate as a projectile (ui/map/rendering/projectile-renderer.ts). */
  private readonly _missileFiredEvents = signal<readonly MissileFiredQueueEntry[]>([]);
  private nextMissileFiredId = 1;
  /** Rolling queue of region captures for WorldMapComponent to animate as a flag crossfade (ui/map/rendering/flag-transition.ts). */
  private readonly _flagTransitionEvents = signal<readonly FlagTransitionQueueEntry[]>([]);
  private nextFlagTransitionId = 1;

  readonly state = this.gameState.state;
  readonly loadError = this.gameState.loadError;
  readonly isLoaded = this.gameState.isLoaded;
  readonly regions = this.gameState.regions;
  readonly seaZones = this.gameState.seaZones;
  readonly factions = this._factions.asReadonly();
  readonly units = this._units.asReadonly();
  readonly economyConfig = this._economyConfig.asReadonly();
  readonly purchaseRejectionReason = this._purchaseRejectionReason.asReadonly();
  readonly movementRejectionReason = this._movementRejectionReason.asReadonly();
  readonly publicSpendingRejectionReason = this._publicSpendingRejectionReason.asReadonly();
  readonly cyberAttackRejectionReason = this._cyberAttackRejectionReason.asReadonly();
  readonly cyberAttackResultMessage = this._cyberAttackResultMessage.asReadonly();
  readonly combatRejectionReason = this._combatRejectionReason.asReadonly();
  readonly combatOutcomeMessage = this._combatOutcomeMessage.asReadonly();
  readonly phaseAdvanceRejectionReason = this._phaseAdvanceRejectionReason.asReadonly();
  readonly combatRegionId = this._combatRegionId.asReadonly();
  readonly missileStrikeMessage = this._missileStrikeMessage.asReadonly();
  readonly aiTurnSummary = this._aiTurnSummary.asReadonly();
  readonly mapEffectEvents = this._mapEffectEvents.asReadonly();
  readonly unitMoveEvents = this._unitMoveEvents.asReadonly();
  readonly missileFiredEvents = this._missileFiredEvents.asReadonly();
  readonly flagTransitionEvents = this._flagTransitionEvents.asReadonly();

  readonly selectedRegionId = this.mapUi.selectedRegionId;
  readonly selectedRegion = this.mapUi.selectedRegion;
  readonly selectedSeaZone = this.mapUi.selectedSeaZone;
  readonly neighborIds = this.mapUi.neighborIds;
  readonly hoveredRegionId = this.mapUi.hoveredRegionId;
  readonly externalDrag = this.mapUi.externalDrag;
  readonly pendingAction = this.mapUi.pendingAction;

  readonly activePlayer = computed(() => {
    const state = this.state();
    if (!state) {
      return null;
    }
    return state.players.find((player) => player.id === state.activePlayerId) ?? null;
  });

  /** Whether the active player is AI-controlled (Solo Command Mode) rather than human. */
  readonly isActivePlayerAiControlled = computed(() => {
    const state = this.state();
    const player = this.activePlayer();
    if (!state || !player) {
      return false;
    }
    return this.engine.getRules().isAiControlled(state, player.id, this._factions());
  });

  /** Whether this unit actually fights in combat (embarked land/support cargo rides along but never rolls dice — see RulesEngine.isCombatParticipant). */
  isCombatParticipant(unit: UnitInstance): boolean {
    return this.engine.getRules().isCombatParticipant(unit, this._units());
  }

  /** Deployed units belonging to the active player, for the Movement panel. */
  readonly activePlayerUnits = computed<readonly UnitInstance[]>(() => {
    const state = this.state();
    const player = this.activePlayer();
    if (!state || !player) {
      return [];
    }
    return state.units.filter((unit) => unit.ownerId === player.id);
  });

  /** All deployed units (any owner) grouped by their current region, for the map's unit markers. */
  readonly unitsByRegion = computed<Readonly<Record<string, readonly UnitInstance[]>>>(() => {
    const state = this.state();
    if (!state) {
      return {};
    }
    const map: Record<string, UnitInstance[]> = {};
    for (const unit of state.units) {
      (map[unit.regionId] ??= []).push(unit);
    }
    return map;
  });

  /**
   * Instance ids of the active player's units that can actually do
   * something this movement phase (PROJECT_RULES.md sections 7/17) — used
   * by the map to highlight movable units. Attack Moves (attack-only)
   * counts a unit as movable if it can reach a hostile region to attack;
   * Tactical Moves counts units that did NOT fight this turn and have a
   * friendly-territory destination. Empty outside the two movement phases.
   */
  readonly movableUnitIds = computed<ReadonlySet<string>>(() => {
    const state = this.state();
    const player = this.activePlayer();
    if (!state || !player) {
      return new Set();
    }
    if (state.phase !== 'attackMoves' && state.phase !== 'tacticalMoves') {
      return new Set();
    }
    const rules = this.engine.getRules();
    const catalog = this._units();
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
        if (canLoad || rules.getTacticalMoveDestinations(state, unit, catalog).length > 0) {
          ids.add(unit.id);
        }
      } else {
        // Attack Moves is attack-only (PROJECT_RULES.md section 7): a unit is
        // movable here only if it can reach a hostile region to attack (or
        // board a transport to get there).
        if (canLoad || rules.getLegalAttackTargets(state, unit, catalog).length > 0) {
          ids.add(unit.id);
        }
      }
    }
    return ids;
  });

  /**
   * Regions holding an unresolved Attack Phase battle for the active player
   * (PROJECT_RULES.md sections 7/8/9-14) — only these are highlighted and
   * clickable on the map while `phase === 'attack'`. Empty in every other
   * phase, same gating pattern as movableUnitIds.
   */
  readonly contestedRegionIds = computed<ReadonlySet<string>>(() => {
    const state = this.state();
    const player = this.activePlayer();
    if (!state || !player || state.phase !== 'attack') {
      return new Set();
    }
    return new Set(this.engine.getRules().getContestedRegionIds(state, player.id));
  });

  /**
   * Declared-but-unfired Rocket System missile strikes (PROJECT_RULES.md
   * section 15), resolved from GameState.missileDeclarations to the
   * launcher's current region + its target region, for the map to draw a
   * trajectory line between them. The launcher itself never moves, so its
   * region only ever changes if it's later ordered elsewhere.
   */
  readonly missileStrikePreviews = computed<readonly { readonly launcherRegionId: string; readonly targetRegionId: string }[]>(
    () => {
      const state = this.state();
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
  );

  /**
   * The RegionCombat currently open in the combat board modal, or null if
   * none is open. A battle's first RegionCombat entry isn't written to state
   * until the player's first action there (RollCombatCommand/SelectMissileCommand
   * both lazily materialize it via RulesEngine.createInitialCombat) — but the
   * modal needs to show the correct starting step (missile choice vs. a
   * normal attacker roll) the instant it opens, before any action has been
   * taken. So this falls back to the same createInitialCombat query (a
   * read-only RulesEngine call, safe to use for display) rather than null.
   */
  readonly activeCombat = computed<RegionCombat | null>(() => {
    const state = this.state();
    const regionId = this._combatRegionId();
    const playerId = this.activePlayer()?.id;
    if (!state || !regionId || !playerId) {
      return null;
    }
    return (
      state.combats[regionId] ??
      this.engine.getRules().createInitialCombat(state, regionId, playerId, this._units())
    );
  });

  /**
   * Read-only preview of the active player's income, delegated to
   * RulesEngine (CODING_STANDARDS.md section 3). Purely informational —
   * income is credited automatically at the start of each player's turn
   * (see EndTurnCommand), there is no manual "collect" action anymore.
   */
  readonly projectedIncome = computed(() => {
    const state = this.state();
    const player = this.activePlayer();
    if (!state || !player) {
      return 0;
    }
    return this.engine.getRules().calculateIncome(state, player.id);
  });

  /**
   * Live-derived win check (PROJECT_RULES.md section 2) — not a command
   * result, since "has anyone won" is purely a function of current region
   * ownership, not something that needs its own state transition. Solo is
   * checked before team so a faction that alone clears both thresholds is
   * reported as the (more specific) solo winner. Null once state loads but
   * no one has won yet.
   */
  readonly victoryStatus = computed<
    { readonly winnerId: string; readonly type: 'solo' | 'team'; readonly starCount: number } | null
  >(() => {
    const state = this.state();
    const economyConfig = this._economyConfig();
    if (!state || !economyConfig) {
      return null;
    }
    const rules = this.engine.getRules();
    const factions = this._factions();

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
  });

  /**
   * Maps each region to the asset path of its current owner's flag image
   * (or the neutral flag for unowned regions). WorldMapComponent draws this
   * image directly over the flag icon baked into the map background, so
   * a captured region visibly shows its new owner's flag.
   */
  readonly regionFlagPaths = computed<Readonly<Record<string, string>>>(() => {
    const regions = this.regions();
    const colors: Record<string, string> = {};
    for (const region of Object.values(regions)) {
      colors[region.id] = region.ownerId
        ? `assets/flags/${region.ownerId}.png`
        : 'assets/flags/neutral.png';
    }
    return colors;
  });

  async initialize(): Promise<void> {
    try {
      const {
        gameState,
        factions,
        units,
        economyConfig,
        aiPurchaseChart,
        aiOrderTable,
        aiAttackConditions,
        aiCyberActionTable,
        aiThreatTrack,
        aiDifficulty,
        aiSabotageEffects,
      } = await this.dataLoader.loadInitialGameData(this.soloSetup.selection());
      this.randomService.seed(gameState.randomSeed);
      this.gameState.set(gameState);

      const factionMap: Record<string, Faction> = {};
      for (const faction of factions) {
        factionMap[faction.id] = faction;
      }
      this._factions.set(factionMap);
      this._units.set(units);
      this._economyConfig.set(economyConfig);
      this._aiPurchaseChart.set(aiPurchaseChart);
      this._aiOrderTable.set(aiOrderTable);
      this._aiAttackConditions.set(aiAttackConditions);
      this._aiCyberActionTable.set(aiCyberActionTable);
      this._aiThreatTrack.set(aiThreatTrack);
      this._aiDifficulty.set(aiDifficulty);
      this._aiSabotageEffects.set(aiSabotageEffects);

      // Solo Command Mode difficulty's one-time starting treasury adjustment
      // (e.g. Easy's -5) — applied once per AI-controlled player, right here
      // at load, before Buy Units ever runs.
      if (gameState.aiConfig) {
        const preset = aiDifficulty.presets[gameState.aiConfig.difficulty];
        if (preset && preset.startingTreasuryDelta !== 0) {
          for (const player of gameState.players) {
            if (this.engine.getRules().isAiControlled(gameState, player.id, factionMap)) {
              this.grantFreeTreasury(player.id, preset.startingTreasuryDelta, `Difficulty: ${gameState.aiConfig.difficulty}`);
            }
          }
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load game data';
      this.gameState.setLoadError(message);
    }
  }

  selectRegion(regionId: string): void {
    this.dispatch(new SelectRegionCommand(regionId));
  }

  clearSelection(): void {
    this.dispatch(new SelectRegionCommand(null));
  }

  setHoveredRegion(regionId: string | null): void {
    this.mapUi.setHovered(regionId);
  }

  purchaseUnit(playerId: string, unitId: string, quantity: number): void {
    this.dispatch(
      new PurchaseUnitCommand(playerId, unitId, quantity, this._units(), this.engine.getRules()),
    );
  }

  /** Solo Command Mode only. Rolls the AI Purchase Chart; the resulting unit ids are read via lastAiPurchaseChartUnitIds() immediately after. */
  rollAiPurchaseChart(playerId: string): void {
    const purchaseChart = this._aiPurchaseChart();
    if (!purchaseChart) {
      return;
    }
    this.dispatch(new RollAiPurchaseChartCommand(playerId, purchaseChart, this.engine.getRules()));
  }

  /** The unit ids rolled by the most recent rollAiPurchaseChart() call (Solo Command Mode only). */
  lastAiPurchaseChartUnitIds(): readonly string[] {
    return this._lastAiPurchaseChartUnitIds();
  }

  /** Solo Command Mode only. Rolls this turn's AI Order; the result is read via lastAiOrderAction() immediately after. */
  rollAiOrder(playerId: string): void {
    const orderTable = this._aiOrderTable();
    if (!orderTable) {
      return;
    }
    this.dispatch(new RollAiOrderCommand(playerId, orderTable, this.engine.getRules()));
  }

  /** The action rolled by the most recent rollAiOrder() call (Solo Command Mode only). */
  lastAiOrderAction(): AiOrderAction | null {
    return this._lastAiOrderAction();
  }

  /** Solo Command Mode's "AI Attack Conditions" thresholds, for the AI decision engine to evaluate a defended target. */
  aiAttackConditionsData(): AiAttackConditionsData | null {
    return this._aiAttackConditions();
  }

  /** Solo Command Mode's Threat Track config (maxLevel/thresholds), for ThreatTrackComponent to render the 0..maxLevel bar. */
  aiThreatTrackData(): AiThreatTrackData | null {
    return this._aiThreatTrack();
  }

  /** Solo Command Mode only. Rolls this turn's Cyber & Political Action; the result is read via lastAiCyberAction() immediately after. */
  rollAiCyberAction(playerId: string): void {
    const cyberActionTable = this._aiCyberActionTable();
    if (!cyberActionTable) {
      return;
    }
    this.dispatch(new RollAiCyberActionCommand(playerId, cyberActionTable, this.engine.getRules()));
  }

  /** The action rolled by the most recent rollAiCyberAction() call (Solo Command Mode only). */
  lastAiCyberAction(): AiCyberAction | null {
    return this._lastAiCyberAction();
  }

  /** Solo Command Mode only. Increments the shared AI Threat Track by 1; any newly-crossed threshold is read via lastThreatCrossedThreshold() immediately after. */
  incrementThreat(playerId: string): void {
    const threatTrackData = this._aiThreatTrack();
    if (!threatTrackData) {
      return;
    }
    this.dispatch(new IncrementThreatCommand(playerId, threatTrackData, this.engine.getRules()));
  }

  /** The threshold (if any) crossed by the most recent incrementThreat() call (Solo Command Mode only). */
  lastThreatCrossedThreshold(): ThreatThreshold | null {
    return this._lastThreatCrossedThreshold();
  }

  /** Solo Command Mode only. Credits treasury with no cost (Threat Track bonus / difficulty preset). */
  grantFreeTreasury(playerId: string, amount: number, reason: string): void {
    this.dispatch(new GrantFreeTreasuryCommand(playerId, amount, reason, this.engine.getRules()));
  }

  /** Solo Command Mode only. Adds units directly to Reserve with no cost (Threat Track bonus). */
  grantFreeUnits(playerId: string, unitId: string, quantity: number): void {
    this.dispatch(new GrantFreeUnitsCommand(playerId, unitId, quantity, this.engine.getRules()));
  }

  /** Solo Command Mode only. A bonus hack outside the normal Cyber Attack cost/slot (Threat Track / Nightmare difficulty). */
  freeCyberAttack(playerId: string, targetPlayerId: string): void {
    this.dispatch(new AiFreeCyberAttackCommand(playerId, targetPlayerId, this.engine.getRules()));
  }

  /** Solo Command Mode's difficulty preset for the current game (null in hotseat play), for AiTurnService's per-turn bonus and Nightmare's every-Nth-turn free cyber attack. */
  aiDifficultyPreset(): AiDifficultyPreset | null {
    const state = this.state();
    const difficulty = state?.aiConfig?.difficulty;
    if (!difficulty) {
      return null;
    }
    return this._aiDifficulty()?.presets[difficulty] ?? null;
  }

  /** Solo Command Mode only. Resolves a Sabotage action against targetPlayerId, using targetRegionId (its richest region) for the "block one region's factory" effect. */
  aiSabotage(playerId: string, targetPlayerId: string, targetRegionId: string): void {
    const economyConfig = this._economyConfig();
    const sabotageEffects = this._aiSabotageEffects();
    if (!economyConfig || !sabotageEffects) {
      return;
    }
    this.dispatch(
      new AiSabotageCommand(playerId, targetPlayerId, targetRegionId, economyConfig, sabotageEffects, this.engine.getRules()),
    );
  }

  /** Solo Command Mode only. Threat Track's free missile strike bonus — a stand-alone bombardment of targetRegionId. */
  applyFreeMissileStrike(playerId: string, targetRegionId: string): void {
    this.dispatch(new ApplyFreeMissileStrikeCommand(playerId, targetRegionId, this._units(), this.engine.getRules()));
  }

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
    this._aiTurnLogEntries.update((entries) => [...entries, { playerId, message }]);
  }

  /** Starts a fresh turn-log buffer — called by AiTurnService right before it starts driving a new chain of consecutive AI factions' turns. */
  beginAiTurnLog(): void {
    this._aiTurnLogEntries.set([]);
  }

  /**
   * Groups the buffered turn-log entries by faction into the dismissable
   * summary the human reviews (GameStore.aiTurnSummary), preserving the
   * order factions first acted in. Leaves aiTurnSummary untouched if no AI
   * faction narrated anything this chain (nothing worth interrupting the
   * player to review) — called by AiTurnService once every consecutive AI
   * faction in the chain has finished its turn.
   */
  finishAiTurnLog(): void {
    const entries = this._aiTurnLogEntries();
    if (entries.length === 0) {
      return;
    }
    const state = this.state();
    const factions = this._factions();
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
    this._aiTurnSummary.set(summary);
  }

  /** Dismisses the AI turn summary modal (Solo Command Mode's "Pokračovať" button). */
  dismissAiTurnSummary(): void {
    this._aiTurnSummary.set(null);
  }

  /** Display name for a unit id, for AI-turn narration (Solo Command Mode). */
  unitDisplayName(unitId: string): string {
    return this._units()[unitId]?.name ?? unitId;
  }

  advancePhase(playerId: string): void {
    this.dispatch(new AdvancePhaseCommand(playerId, this._units(), this.engine.getRules()));
  }

  endTurn(playerId: string): void {
    const economyConfig = this._economyConfig();
    if (!economyConfig) {
      return;
    }
    this.dispatch(
      new EndTurnCommand(playerId, economyConfig, this._factions(), this._units(), this.engine.getRules()),
    );
  }

  deployUnit(playerId: string, unitId: string, regionId: string): void {
    this.dispatch(
      new DeployUnitCommand(playerId, unitId, regionId, this._units(), this.engine.getRules()),
    );
  }

  moveUnit(playerId: string, unitInstanceId: string, destinationRegionId: string): void {
    this.dispatch(
      new MoveUnitCommand(playerId, unitInstanceId, destinationRegionId, this._units(), this.engine.getRules()),
    );
  }

  loadUnit(playerId: string, unitInstanceId: string, transportInstanceId: string): void {
    this.dispatch(
      new LoadUnitCommand(playerId, unitInstanceId, transportInstanceId, this._units(), this.engine.getRules()),
    );
  }

  unloadUnit(playerId: string, unitInstanceId: string, destinationRegionId: string): void {
    const economyConfig = this._economyConfig();
    if (!economyConfig) {
      return;
    }
    this.dispatch(
      new UnloadUnitCommand(
        playerId,
        unitInstanceId,
        destinationRegionId,
        this._units(),
        economyConfig,
        this.engine.getRules(),
      ),
    );
  }

  /** Coastal regions an embarked unit could disembark onto (PROJECT_RULES.md section 30). */
  unloadDestinations(unitInstanceId: string): readonly string[] {
    const state = this.state();
    const unit = state ? this.engine.getRules().getUnitInstance(state, unitInstanceId) : null;
    if (!state || !unit) {
      return [];
    }
    return this.engine.getRules().getUnloadDestinations(state, unit);
  }

  /** Regions (or, for naval units, sea zones) a Reserve unit could be deployed to right now (PROJECT_RULES.md section 18). */
  deployDestinations(unitId: string): readonly string[] {
    const state = this.state();
    if (!state) {
      return [];
    }
    return this.engine.getRules().getDeployDestinations(state, state.activePlayerId, unitId, this._units());
  }

  /**
   * Arms a click-to-place deploy: the map highlights every legal destination
   * for this Reserve unit, and the next canvas click on one of them deploys
   * it there (see resolvePendingActionAt, called from WorldMapComponent).
   */
  armDeployUnit(unitId: string): void {
    this.mapUi.armPendingAction({ kind: 'deploy', subjectId: unitId, destinations: this.deployDestinations(unitId) });
  }

  /** Arms a click-to-place unload: same flow as armDeployUnit, but for an embarked unit's disembark destinations. */
  armUnloadUnit(unitInstanceId: string): void {
    this.mapUi.armPendingAction({
      kind: 'unload',
      subjectId: unitInstanceId,
      destinations: this.unloadDestinations(unitInstanceId),
    });
  }

  cancelPendingAction(): void {
    this.mapUi.clearPendingAction();
  }

  /**
   * Resolves an armed deploy/unload against a clicked region or sea-zone id
   * (or null, e.g. empty ocean) — a click outside the highlighted
   * destinations just cancels quietly, same as clicking away from a
   * selection elsewhere in this app. Returns whether an action was armed,
   * so WorldMapComponent knows to skip its normal click handling either way.
   */
  resolvePendingActionAt(targetId: string | null): boolean {
    const action = this.mapUi.pendingAction();
    if (!action) {
      return false;
    }
    const playerId = this.state()?.activePlayerId;
    if (playerId && targetId && action.destinations.includes(targetId)) {
      if (action.kind === 'deploy') {
        this.deployUnit(playerId, action.subjectId, targetId);
      } else {
        this.unloadUnit(playerId, action.subjectId, targetId);
      }
    }
    this.mapUi.clearPendingAction();
    return true;
  }

  attackRegion(playerId: string, unitInstanceId: string, targetRegionId: string): void {
    const economyConfig = this._economyConfig();
    if (!economyConfig) {
      return;
    }
    this.dispatch(
      new AttackCommand(playerId, unitInstanceId, targetRegionId, this._units(), economyConfig, this.engine.getRules()),
    );
  }

  /** Opens the combat board modal for a contested region (PROJECT_RULES.md sections 9-14). */
  openCombat(regionId: string): void {
    this._combatRegionId.set(regionId);
    this._combatOutcomeMessage.set(null);
    this._combatRejectionReason.set(null);
  }

  closeCombat(): void {
    this._combatRegionId.set(null);
    this._combatOutcomeMessage.set(null);
  }

  /** Rolls the next round of dice for whichever side is up in a region's Attack Phase battle. */
  rollCombat(playerId: string, regionId: string): void {
    this.dispatch(new RollCombatCommand(playerId, regionId, this._units(), this.engine.getRules()));
  }

  /** Arms one Reserve missile for a pending strike (PROJECT_RULES.md section 15) — first of two clicks; see FireMissileCommand for the roll itself. */
  selectMissile(playerId: string, regionId: string, missileUnitId: string): void {
    this.dispatch(new SelectMissileCommand(playerId, regionId, missileUnitId, this._units(), this.engine.getRules()));
  }

  /** Rolls the missile armed via selectMissile() — resolves interception/hit and removes it from Reserve either way (PROJECT_RULES.md section 15). */
  fireMissile(playerId: string, regionId: string): void {
    this.dispatch(new FireMissileCommand(playerId, regionId, this._units(), this.engine.getRules()));
  }

  /** Removes one unit as a casualty during a region's Attack Phase battle. */
  removeCasualty(playerId: string, regionId: string, unitInstanceId: string): void {
    const economyConfig = this._economyConfig();
    if (!economyConfig) {
      return;
    }
    this.dispatch(
      new RemoveCasualtyCommand(playerId, regionId, unitInstanceId, this._units(), economyConfig, this.engine.getRules()),
    );
  }

  /** Public Spending (PROJECT_RULES.md section 5): spend treasury to raise the active player's own Citizen Satisfaction. */
  raiseCitizenSatisfaction(playerId: string, amount: number): void {
    const economyConfig = this._economyConfig();
    if (!economyConfig) {
      return;
    }
    this.dispatch(new RaiseCitizenSatisfactionCommand(playerId, amount, economyConfig, this.engine.getRules()));
  }

  /** Hacking (PROJECT_RULES.md section 6): attempt to steal treasury from another player during the Cyber Attack Phase. */
  hack(playerId: string, targetPlayerId: string): void {
    const economyConfig = this._economyConfig();
    if (!economyConfig) {
      return;
    }
    this.dispatch(new HackCommand(playerId, targetPlayerId, economyConfig, this.engine.getRules()));
  }

  /** Political Influence (PROJECT_RULES.md section 6): attempt to place an influence token on a neutral region. */
  politicalInfluence(playerId: string, targetRegionId: string): void {
    const economyConfig = this._economyConfig();
    if (!economyConfig) {
      return;
    }
    this.dispatch(new PoliticalInfluenceCommand(playerId, targetRegionId, economyConfig, this.engine.getRules()));
  }

  /** Upgrade Hack Level (PROJECT_RULES.md section 6): also a Cyber Attack Phase action, shares the once-per-turn slot. */
  upgradeHackLevel(playerId: string): void {
    const economyConfig = this._economyConfig();
    if (!economyConfig) {
      return;
    }
    this.dispatch(new UpgradeHackLevelCommand(playerId, economyConfig, this.engine.getRules()));
  }

  /**
   * Read-only preview of a unit's legal plain-move destinations. Plain
   * moves only happen during Tactical Moves (friendly territory only) — with
   * one exception (PROJECT_RULES.md section 7): naval units may also
   * reposition through sea zones during Attack Moves, so a transport can
   * load, sail, and amphibious-assault-unload its cargo all in one phase
   * (see MoveUnitCommand). Everything else returns [] outside Tactical
   * Moves — Attack Moves is otherwise attack-only (see legalAttackTargets).
   */
  legalMoveDestinations(unitInstanceId: string): readonly string[] {
    const state = this.state();
    const unit = state ? this.engine.getRules().getUnitInstance(state, unitInstanceId) : null;
    if (!state || !unit) {
      return [];
    }
    const isNavalRepositioning = state.phase === 'attackMoves' && this._units()[unit.unitId]?.category === 'naval';
    if (state.phase !== 'tacticalMoves' && !isNavalRepositioning) {
      return [];
    }
    return this.engine.getRules().getTacticalMoveDestinations(state, unit, this._units());
  }

  /** Read-only preview of a unit's legal attack targets, delegated to RulesEngine. */
  legalAttackTargets(unitInstanceId: string): readonly string[] {
    const state = this.state();
    const unit = state ? this.engine.getRules().getUnitInstance(state, unitInstanceId) : null;
    if (!state || !unit) {
      return [];
    }
    return this.engine.getRules().getLegalAttackTargets(state, unit, this._units());
  }

  /** Sea-zone drop targets that would load this unit onto a transport there (PROJECT_RULES.md section 30). */
  loadableTransportTargets(unitInstanceId: string): readonly { seaZoneId: string; transportId: string }[] {
    const state = this.state();
    const unit = state ? this.engine.getRules().getUnitInstance(state, unitInstanceId) : null;
    if (!state || !unit) {
      return [];
    }
    return this.engine.getRules().getLoadableTransportTargets(state, unit, this._units());
  }

  /**
   * Surfaces a drag-and-drop drop that the map component detected as
   * illegal (dropTarget isn't in loadTargets/attackTargets/moveDestinations)
   * before ever reaching a command — there's no engine event to react to,
   * so this sets the same signal MovementRejected normally would.
   */
  reportInvalidDestination(): void {
    this._movementRejectionReason.set('That is not a legal destination for this unit.');
  }

  /**
   * Starts a unit drag that originates outside the map canvas (e.g. a unit
   * card in RegionInfoPanelComponent) so it can be dropped onto a region the
   * same way a canvas-originated drag is — see WorldMapComponent, which owns
   * the actual region hit-testing once this is armed. No-op for a unit that
   * isn't the active player's, is embarked, has no moves left, or if it's
   * not currently a movement phase (mirrors WorldMapComponent.tryPickUpUnit).
   */
  startExternalUnitDrag(unitInstanceId: string): void {
    const state = this.state();
    if (!state || !MOVEMENT_PHASES.includes(state.phase)) {
      return;
    }
    const unit = this.engine.getRules().getUnitInstance(state, unitInstanceId);
    if (
      !unit ||
      unit.ownerId !== state.activePlayerId ||
      unit.transportedBy !== null ||
      unit.movesRemaining <= 0
    ) {
      return;
    }
    const moveDestinations = this.legalMoveDestinations(unitInstanceId);
    const attackTargets = state.phase === 'attackMoves' ? this.legalAttackTargets(unitInstanceId) : [];
    const loadTargets = new Map<string, string>();
    for (const target of this.loadableTransportTargets(unitInstanceId)) {
      loadTargets.set(target.seaZoneId, target.transportId);
    }
    this.mapUi.startExternalDrag({
      unitInstanceId,
      unitId: unit.unitId,
      originId: unit.regionId,
      moveDestinations,
      attackTargets,
      loadTargets,
    });
  }

  /** Resolves an in-progress external unit drag against a drop target (a region or sea-zone id, or null if dropped off-map), then clears the drag. */
  resolveExternalDrop(dropTargetId: string | null): void {
    const drag = this.mapUi.externalDrag();
    const activePlayerId = this.state()?.activePlayerId;
    if (drag && dropTargetId && activePlayerId) {
      const loadTransportId = drag.loadTargets.get(dropTargetId);
      if (loadTransportId) {
        this.loadUnit(activePlayerId, drag.unitInstanceId, loadTransportId);
      } else if (drag.attackTargets.includes(dropTargetId)) {
        this.attackRegion(activePlayerId, drag.unitInstanceId, dropTargetId);
      } else if (drag.moveDestinations.includes(dropTargetId)) {
        this.moveUnit(activePlayerId, drag.unitInstanceId, dropTargetId);
      } else {
        this.reportInvalidDestination();
      }
    }
    this.mapUi.endExternalDrag();
  }

  private dispatch(command: Command): void {
    const currentState = this.gameState.state();
    if (!currentState) {
      return;
    }
    const result = this.engine.execute(currentState, command);
    this.gameState.set(result.state);
    this.applyEvents(result.events);
  }

  /** Queues an explosion/glitch/spawn burst at regionId for WorldMapComponent to pick up — capped to a small rolling window since only the last moment or two is ever still-animating by the time a consumer next reads it. */
  private pushMapEffect(regionId: string, kind: MapEffectEvent['kind']): void {
    const id = this.nextMapEffectId++;
    this._mapEffectEvents.update((events) => [...events, { id, regionId, kind }].slice(-40));
  }

  /** Queues a sliding-icon animation for a unit that just moved from one region/sea-zone to another. */
  private pushUnitMove(unitInstanceId: string, fromRegionId: string, toRegionId: string): void {
    const id = this.nextUnitMoveId++;
    this._unitMoveEvents.update((events) => [...events, { id, unitInstanceId, fromRegionId, toRegionId }].slice(-40));
  }

  /** Queues a projectile animation for a missile that just fired from launcherRegionId at regionId. */
  private pushMissileFired(launcherRegionId: string, regionId: string): void {
    const id = this.nextMissileFiredId++;
    this._missileFiredEvents.update((events) => [...events, { id, launcherRegionId, regionId }].slice(-40));
  }

  /** Queues a flag-crossfade animation for a region that just changed hands. */
  private pushFlagTransition(regionId: string, previousOwnerId: string | null): void {
    const id = this.nextFlagTransitionId++;
    this._flagTransitionEvents.update((events) => [...events, { id, regionId, previousOwnerId }].slice(-40));
  }

  /** A player's capital region id, for cyber-attack effects that target a player rather than a region directly (e.g. Hack). */
  private resolveCapitalRegionId(playerId: string): string | undefined {
    const player = this.state()?.players.find((candidate) => candidate.id === playerId);
    if (!player) {
      return undefined;
    }
    return this._factions()[player.factionId]?.capitalRegionId;
  }

  private applyEvents(events: readonly GameEngineEvent[]): void {
    for (const event of events) {
      switch (event.type) {
        case 'RegionSelected':
          this.mapUi.setSelected(event.regionId);
          break;
        case 'RegionDeselected':
          this.mapUi.setSelected(null);
          break;
        case 'RegionContested':
          // Pop the contested region open so the player sees the pending
          // battle (defenders + war symbol + attackers) right after the move.
          this.mapUi.setSelected(event.regionId);
          this._movementRejectionReason.set(null);
          this.pushMapEffect(event.regionId, 'explosion');
          break;
        case 'MissileStrikeDeclared': {
          this._movementRejectionReason.set(null);
          const regionName = this.regions()[event.regionId]?.name ?? event.regionId;
          this._missileStrikeMessage.set(`Missile strike declared on ${regionName}.`);
          break;
        }
        case 'UnitMoved':
          this._purchaseRejectionReason.set(null);
          this._movementRejectionReason.set(null);
          this._publicSpendingRejectionReason.set(null);
          this._cyberAttackRejectionReason.set(null);
          this._combatRejectionReason.set(null);
          this._phaseAdvanceRejectionReason.set(null);
          this.pushUnitMove(event.unitInstanceId, event.fromRegionId, event.toRegionId);
          break;
        case 'UnitDeployed':
          this._purchaseRejectionReason.set(null);
          this._movementRejectionReason.set(null);
          this._publicSpendingRejectionReason.set(null);
          this._cyberAttackRejectionReason.set(null);
          this._combatRejectionReason.set(null);
          this._phaseAdvanceRejectionReason.set(null);
          this.pushMapEffect(event.regionId, 'spawn');
          break;
        case 'MissileFired':
          this.pushMissileFired(event.launcherRegionId, event.regionId);
          break;
        case 'PurchaseRejected':
          this._purchaseRejectionReason.set(event.reason);
          break;
        case 'MovementRejected':
          this._movementRejectionReason.set(event.reason);
          break;
        case 'PublicSpendingRejected':
          this._publicSpendingRejectionReason.set(event.reason);
          break;
        case 'CyberAttackRejected':
          this._cyberAttackRejectionReason.set(event.reason);
          break;
        case 'HackResolved': {
          this._cyberAttackRejectionReason.set(null);
          this._cyberAttackResultMessage.set(
            event.succeeded
              ? `Hack succeeded (rolled ${event.attackRoll}) — stole ${event.moneyStolen} money.`
              : `Hack failed (rolled ${event.attackRoll}).`,
          );
          const capitalRegionId = this.resolveCapitalRegionId(event.targetPlayerId);
          if (capitalRegionId) {
            this.pushMapEffect(capitalRegionId, 'glitch');
          }
          break;
        }
        case 'PoliticalInfluenceResolved':
          this._cyberAttackRejectionReason.set(null);
          this._cyberAttackResultMessage.set(
            !event.succeeded
              ? `Political Influence failed (rolled ${event.roll}).`
              : event.capturedRegion
                ? `Political Influence succeeded (rolled ${event.roll}) — region captured!`
                : `Political Influence succeeded (rolled ${event.roll}) — token placed.`,
          );
          this.pushMapEffect(event.regionId, 'glitch');
          break;
        case 'HackLevelUpgraded':
          this._cyberAttackRejectionReason.set(null);
          this._cyberAttackResultMessage.set(`Hack Level upgraded to ${event.hackLevel}.`);
          break;
        case 'CombatRejected':
          this._combatRejectionReason.set(event.reason);
          break;
        case 'PhaseAdvanceRejected':
          this._phaseAdvanceRejectionReason.set(event.reason);
          break;
        case 'CombatRoundRolled':
          this._combatRejectionReason.set(null);
          break;
        case 'CasualtyRemoved':
          this._combatRejectionReason.set(null);
          this.pushMapEffect(event.regionId, 'explosion');
          break;
        case 'RegionCombatResolved': {
          this._combatRejectionReason.set(null);
          // A sea zone isn't ownable — "captured" there means "won the naval
          // battle" (the enemy fleet was destroyed), not a territory flip.
          const isNaval = this.state()?.seaZones[event.regionId] !== undefined;
          const message = isNaval
            ? event.captured
              ? 'Enemy fleet destroyed!'
              : 'Your fleet was destroyed.'
            : event.captured
              ? 'Region captured!'
              : 'Attack failed — the region stays with its current owner.';
          this._combatOutcomeMessage.set(message);
          break;
        }
        case 'AiPurchaseChartRolled':
          this._lastAiPurchaseChartUnitIds.set(event.unitIds);
          break;
        case 'AiOrderRolled':
          this._lastAiOrderAction.set(event.action);
          break;
        case 'AiCyberActionRolled':
          this._lastAiCyberAction.set(event.action);
          break;
        case 'ThreatIncreased':
          this._lastThreatCrossedThreshold.set(event.crossedThreshold);
          break;
        case 'AiSabotageResolved':
          this.pushMapEffect(event.targetRegionId, 'glitch');
          break;
        case 'FreeMissileStrikeResolved':
          this.pushMapEffect(event.targetRegionId, 'explosion');
          break;
        case 'PhaseAdvanced':
        case 'TurnEnded':
          this.mapUi.clearPendingAction();
          this._purchaseRejectionReason.set(null);
          this._movementRejectionReason.set(null);
          this._publicSpendingRejectionReason.set(null);
          this._cyberAttackRejectionReason.set(null);
          this._combatRejectionReason.set(null);
          this._phaseAdvanceRejectionReason.set(null);
          break;
        case 'RegionCaptured':
          this._purchaseRejectionReason.set(null);
          this._movementRejectionReason.set(null);
          this._publicSpendingRejectionReason.set(null);
          this._cyberAttackRejectionReason.set(null);
          this._combatRejectionReason.set(null);
          this._phaseAdvanceRejectionReason.set(null);
          this.pushMapEffect(event.regionId, 'explosion');
          this.pushFlagTransition(event.regionId, event.previousOwnerId);
          break;
        default:
          this._purchaseRejectionReason.set(null);
          this._movementRejectionReason.set(null);
          this._publicSpendingRejectionReason.set(null);
          this._cyberAttackRejectionReason.set(null);
          this._combatRejectionReason.set(null);
          this._phaseAdvanceRejectionReason.set(null);
      }
    }
  }
}
