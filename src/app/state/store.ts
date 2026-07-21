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
import { FireMissileCommand } from '../engine/commands/fire-missile.command';
import { RemoveCasualtyCommand } from '../engine/commands/remove-casualty.command';
import { GameEngineEvent } from '../interfaces/game-events';
import { Faction } from '../models/faction.model';
import { UnitDefinition } from '../models/unit.model';
import { UnitInstance } from '../models/unit-instance.model';
import { EconomyConfig } from '../models/economy-config.model';
import { RegionCombat } from '../models/region-combat.model';
import { GameStateSignal } from './game.state';
import { MapUiState } from './map.state';

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

  readonly selectedRegionId = this.mapUi.selectedRegionId;
  readonly selectedRegion = this.mapUi.selectedRegion;
  readonly selectedSeaZone = this.mapUi.selectedSeaZone;
  readonly neighborIds = this.mapUi.neighborIds;
  readonly hoveredRegionId = this.mapUi.hoveredRegionId;

  readonly activePlayer = computed(() => {
    const state = this.state();
    if (!state) {
      return null;
    }
    return state.players.find((player) => player.id === state.activePlayerId) ?? null;
  });

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

  /** The RegionCombat currently open in the combat board modal, or null if none/not started yet. */
  readonly activeCombat = computed<RegionCombat | null>(() => {
    const state = this.state();
    const regionId = this._combatRegionId();
    if (!state || !regionId) {
      return null;
    }
    return state.combats[regionId] ?? null;
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
      const { gameState, factions, units, economyConfig } = await this.dataLoader.loadInitialGameData();
      this.randomService.seed(gameState.randomSeed);
      this.gameState.set(gameState);

      const factionMap: Record<string, Faction> = {};
      for (const faction of factions) {
        factionMap[faction.id] = faction;
      }
      this._factions.set(factionMap);
      this._units.set(units);
      this._economyConfig.set(economyConfig);
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

  /** Fires one missile from Reserve at a region where a Rocket System declared a strike (PROJECT_RULES.md section 15). */
  fireMissile(playerId: string, regionId: string, missileUnitId: string): void {
    this.dispatch(new FireMissileCommand(playerId, regionId, missileUnitId, this._units(), this.engine.getRules()));
  }

  /** Removes one unit as a casualty during a region's Attack Phase battle. */
  removeCasualty(playerId: string, regionId: string, unitInstanceId: string): void {
    const economyConfig = this._economyConfig();
    if (!economyConfig) {
      return;
    }
    this.dispatch(
      new RemoveCasualtyCommand(playerId, regionId, unitInstanceId, economyConfig, this.engine.getRules()),
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
   * moves only happen during Tactical Moves (friendly territory only);
   * Attack Moves is attack-only (see MoveUnitCommand / legalAttackTargets),
   * so this returns [] outside Tactical Moves.
   */
  legalMoveDestinations(unitInstanceId: string): readonly string[] {
    const state = this.state();
    const unit = state ? this.engine.getRules().getUnitInstance(state, unitInstanceId) : null;
    if (!state || !unit || state.phase !== 'tacticalMoves') {
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

  private dispatch(command: Command): void {
    const currentState = this.gameState.state();
    if (!currentState) {
      return;
    }
    const result = this.engine.execute(currentState, command);
    this.gameState.set(result.state);
    this.applyEvents(result.events);
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
        case 'HackResolved':
          this._cyberAttackRejectionReason.set(null);
          this._cyberAttackResultMessage.set(
            event.succeeded
              ? `Hack succeeded (rolled ${event.attackRoll}) — stole ${event.moneyStolen} money.`
              : `Hack failed (rolled ${event.attackRoll}).`,
          );
          break;
        case 'PoliticalInfluenceResolved':
          this._cyberAttackRejectionReason.set(null);
          this._cyberAttackResultMessage.set(
            !event.succeeded
              ? `Political Influence failed (rolled ${event.roll}).`
              : event.capturedRegion
                ? `Political Influence succeeded (rolled ${event.roll}) — region captured!`
                : `Political Influence succeeded (rolled ${event.roll}) — token placed.`,
          );
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
        case 'CasualtyRemoved':
          this._combatRejectionReason.set(null);
          break;
        case 'RegionCombatResolved':
          this._combatRejectionReason.set(null);
          this._combatOutcomeMessage.set(
            event.captured ? 'Region captured!' : 'Attack failed — the region stays with its current owner.',
          );
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
