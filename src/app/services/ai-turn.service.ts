import { Injectable, effect, inject } from '@angular/core';
import { GameCoreStore } from '../state/core/game-core.store';
import { MapUiStore } from '../state/map/map-ui.store';
import { CombatStore } from '../state/combat/combat.store';
import { MovementStore } from '../state/movement/movement.store';
import { EconomyStore } from '../state/economy/economy.store';
import { CyberAttackStore } from '../state/cyber/cyber-attack.store';
import { AiStore } from '../state/ai/ai.store';
import { routeTurnCycleEvents } from '../state/shared/route-turn-cycle-events';
import { GamePhase, GameState } from '../models/game-state.model';
import { AiOrderAction } from '../models/ai-order.model';
import { AiAttackConditionsData } from '../models/ai-attack-conditions.model';
import { AiDecisionEngine } from '../engine/ai/ai-decision-engine';
import { RulesEngine } from '../engine/rules-engine';

/**
 * Hard bailout against an AI faction with no legal action anywhere in some
 * phase (should never happen, but CODING_STANDARTS.md section 13 — never
 * crash or hang silently). Comfortably above a worst-case turn: 6 factions x
 * 7 phases would be ~42 dispatches even with nothing happening, so this
 * covers many consecutive AI factions' turns before tripping.
 */
const MAX_DISPATCHES_PER_TRIGGER = 300;
/** Per Reserve unit-type safety net inside one Place New Units phase — quantity only ever shrinks by 1 per deploy, so this should never actually trip. */
const MAX_DEPLOYS_PER_UNIT_TYPE = 30;
/** Safety net for one region's combat loop — a battle can run many rounds, but each round is only a handful of steps, so this comfortably covers a very long fight. */
const MAX_COMBAT_STEPS_PER_REGION = 200;

/**
 * Solo Command Mode orchestrator: drives every AI-controlled faction's full
 * turn using ONLY each feature store's existing public dispatch methods —
 * never bypassing the Command pattern, exactly like a human UI action would.
 * GameCoreStore.dispatch() is fully synchronous, so a whole back-to-back run
 * of AI factions completes within one JS task: near-instant, then presented
 * to the human as a single dismissable per-faction summary
 * (AiStore.narrateAiAction / beginAiTurnLog / finishAiTurnLog /
 * AiTurnSummaryComponent) they review at their own pace before continuing —
 * not transient toasts, and not animated step-by-step.
 *
 * Provided in root and force-instantiated once from GameScreenComponent
 * (same pattern GameStore itself already uses) so its constructor effect()
 * starts watching state immediately.
 */
@Injectable({ providedIn: 'root' })
export class AiTurnService {
  private readonly gameCoreStore = inject(GameCoreStore);
  private readonly mapUiStore = inject(MapUiStore);
  private readonly combatStore = inject(CombatStore);
  private readonly movementStore = inject(MovementStore);
  private readonly economyStore = inject(EconomyStore);
  private readonly cyberAttackStore = inject(CyberAttackStore);
  private readonly aiStore = inject(AiStore);
  private readonly decisionEngine = new AiDecisionEngine();
  private readonly rules = new RulesEngine();
  private running = false;
  /**
   * This turn's "Determine AI Order" roll, made once at Buy Units entry and
   * consumed later the same turn (mainly Attack Moves). Not part of
   * GameState — purely a same-turn scratch value, safe as a single mutable
   * field since one faction's whole turn always completes before the next
   * faction's buyUnits phase can overwrite it.
   */
  private pendingOrderAction: AiOrderAction | null = null;

  constructor() {
    effect(() => {
      this.gameCoreStore.state();
      if (!this.running && this.aiStore.isActivePlayerAiControlled()) {
        this.runAiTurns();
      }
    });
  }

  /** Drives consecutive AI factions' turns back-to-back until control reaches a human player, then hands the human a single dismissable summary of everything every AI faction just did. */
  private runAiTurns(): void {
    this.running = true;
    this.aiStore.beginAiTurnLog();
    try {
      let dispatches = 0;
      while (dispatches < MAX_DISPATCHES_PER_TRIGGER) {
        const state = this.gameCoreStore.state();
        if (!state || !this.aiStore.isActivePlayerAiControlled()) {
          return;
        }
        this.runPhaseStep(state.activePlayerId, state.phase);
        dispatches += 1;
      }
      const stuckState = this.gameCoreStore.state();
      if (stuckState) {
        // eslint-disable-next-line no-console
        console.error(
          `[AiTurnService] Hit the ${MAX_DISPATCHES_PER_TRIGGER}-dispatch cap for player "${stuckState.activePlayerId}" without reaching a human turn — forcing endTurn.`,
        );
        this.endTurn(stuckState.activePlayerId);
      }
    } finally {
      this.aiStore.finishAiTurnLog();
      this.running = false;
    }
  }

  /** Runs `playerId` through GameCoreStore.advancePhase() and forwards the resulting events to every store whose reactToEvents cares — mirrors what a UI-driven AdvancePhaseBarComponent click does. */
  private advancePhase(playerId: string): void {
    routeTurnCycleEvents(this.gameCoreStore.advancePhase(playerId), {
      mapUiStore: this.mapUiStore,
      combatStore: this.combatStore,
      movementStore: this.movementStore,
      economyStore: this.economyStore,
      cyberAttackStore: this.cyberAttackStore,
    });
  }

  /** Runs `playerId` through GameCoreStore.endTurn() and forwards the resulting events — see advancePhase. */
  private endTurn(playerId: string): void {
    routeTurnCycleEvents(this.gameCoreStore.endTurn(playerId), {
      mapUiStore: this.mapUiStore,
      combatStore: this.combatStore,
      movementStore: this.movementStore,
      economyStore: this.economyStore,
      cyberAttackStore: this.cyberAttackStore,
    });
  }

  private runPhaseStep(playerId: string, phase: GamePhase): void {
    switch (phase) {
      case 'buyUnits':
        this.runBuyUnits(playerId);
        return;
      case 'attackMoves':
        this.runAttackMoves(playerId);
        return;
      case 'attack':
        this.runAttackPhase(playerId);
        return;
      case 'tacticalMoves':
        this.runTacticalMoves(playerId);
        return;
      case 'placeNewUnits':
        this.runPlaceNewUnits(playerId);
        return;
      case 'cyberAttack':
        this.runCyberAttack(playerId);
        return;
      case 'collectIncome':
        this.endTurn(playerId);
        return;
    }
  }

  /**
   * Rulebook "Increase Threat by 1" + "Determine AI Order" + "Buy Units", in
   * that order: increments the shared Threat Track and applies any
   * newly-crossed threshold bonus, rolls this turn's order (consumed later
   * in Attack Moves), then one Purchase Chart roll for the whole turn's
   * spending. Unaffordable rolled units are skipped silently, never
   * dispatched (so no spurious rejection toast).
   */
  private runBuyUnits(playerId: string): void {
    this.applyThreatIncrement(playerId);
    this.applyDifficultyPerTurnBonus(playerId);

    this.aiStore.rollAiOrder(playerId);
    this.pendingOrderAction = this.aiStore.lastAiOrderAction();

    this.aiStore.rollAiPurchaseChart(playerId);
    const rolledUnitIds = this.aiStore.lastAiPurchaseChartUnitIds();

    const bought: string[] = [];
    for (const unitId of rolledUnitIds) {
      const player = this.gameCoreStore.activePlayer();
      const cost = this.gameCoreStore.units()[unitId]?.cost ?? 0;
      if (!player || cost <= 0 || player.treasury < cost) {
        continue;
      }
      this.economyStore.purchaseUnit(playerId, unitId, 1);
      bought.push(unitId);
    }

    if (bought.length > 0) {
      const playerName = this.gameCoreStore.activePlayer()?.displayName ?? playerId;
      const names = bought.map((unitId) => this.gameCoreStore.units()[unitId]?.name ?? unitId).join(', ');
      this.aiStore.narrateAiAction(playerId, `${playerName} bought ${names}.`);
    }

    this.advancePhase(playerId);
  }

  /**
   * Rulebook "Threat Track": increments the shared counter and applies
   * whichever one-time bonus (if any) was just crossed. 'totalWar' isn't
   * applied here at all: IncrementThreatCommand itself sets the permanent
   * aiConfig.totalWarActive flag, read later by runAttackMoves.
   */
  private applyThreatIncrement(playerId: string): void {
    this.aiStore.incrementThreat(playerId);
    const threshold = this.aiStore.lastThreatCrossedThreshold();
    if (!threshold) {
      return;
    }
    const playerName = this.gameCoreStore.activePlayer()?.displayName ?? playerId;
    switch (threshold.bonus) {
      case 'treasury':
        this.aiStore.grantFreeTreasury(playerId, threshold.amount ?? 0, 'Threat Track');
        this.aiStore.narrateAiAction(playerId, `${playerName}'s Threat Track grants +${threshold.amount ?? 0} treasury.`);
        return;
      case 'freeCyberAttack': {
        const state = this.gameCoreStore.state();
        const targetPlayerId = state
          ? this.decisionEngine.pickHackTarget(state, playerId, this.gameCoreStore.factions(), this.rules)
          : null;
        if (targetPlayerId) {
          this.aiStore.freeCyberAttack(playerId, targetPlayerId);
          this.aiStore.narrateAiAction(playerId, `${playerName}'s Threat Track triggers a free cyber attack.`);
        }
        return;
      }
      case 'freeInfantry':
        if (threshold.unitId && threshold.quantity) {
          this.aiStore.grantFreeUnits(playerId, threshold.unitId, threshold.quantity);
          this.aiStore.narrateAiAction(playerId, `${playerName}'s Threat Track grants ${threshold.quantity}x free units.`);
        }
        return;
      case 'freeMissileStrike': {
        const state = this.gameCoreStore.state();
        const targetRegionId = state
          ? this.decisionEngine.pickRichestEnemyRegion(state, playerId, this.gameCoreStore.factions(), this.rules)
          : null;
        if (targetRegionId) {
          this.aiStore.applyFreeMissileStrike(playerId, targetRegionId);
          const regionName = this.gameCoreStore.regions()[targetRegionId]?.name ?? targetRegionId;
          this.aiStore.narrateAiAction(playerId, `${playerName}'s Threat Track triggers a free missile strike on ${regionName}.`);
        }
        return;
      }
      case 'totalWar':
        return;
    }
  }

  /**
   * Solo Command Mode difficulty (rulebook section 8): grants this turn's
   * per-turn treasury bonus (Hard/Nightmare; Easy/Normal are 0, a harmless
   * no-op) and, on Nightmare, a bonus hack every N completed turns for this
   * faction (PlayerState.aiTurnCounter, just bumped by applyThreatIncrement
   * above via IncrementThreatCommand).
   */
  private applyDifficultyPerTurnBonus(playerId: string): void {
    const preset = this.aiStore.aiDifficultyPreset();
    if (!preset) {
      return;
    }

    if (preset.treasuryPerTurn !== 0) {
      this.aiStore.grantFreeTreasury(playerId, preset.treasuryPerTurn, 'Difficulty');
    }

    if (preset.freeCyberAttackEveryNTurns > 0) {
      const aiTurnCounter = this.gameCoreStore.activePlayer()?.aiTurnCounter ?? 0;
      if (aiTurnCounter > 0 && aiTurnCounter % preset.freeCyberAttackEveryNTurns === 0) {
        const state = this.gameCoreStore.state();
        const targetPlayerId = state
          ? this.decisionEngine.pickHackTarget(state, playerId, this.gameCoreStore.factions(), this.rules)
          : null;
        if (targetPlayerId) {
          this.aiStore.freeCyberAttack(playerId, targetPlayerId);
          const playerName = this.gameCoreStore.activePlayer()?.displayName ?? playerId;
          this.aiStore.narrateAiAction(playerId, `${playerName}'s Nightmare difficulty triggers a free cyber attack.`);
        }
      }
    }
  }

  /**
   * Rulebook "Cyber/Political Action" step: if this turn's order was
   * "pressure a neutral region," that IS the mandatory action for the turn —
   * the separate roll below is skipped so the same slot isn't used twice.
   * Otherwise, rolls the Cyber & Political Action table and dispatches the
   * matching existing command. 'sabotage' is a future build step — rolled
   * and acknowledged, but not yet applied. Finally, applies Cyber State's
   * doctrine special (an extra bonus hack) if this turn's order was the
   * doctrine-special roll.
   */
  private runCyberAttack(playerId: string): void {
    const economyConfig = this.gameCoreStore.economyConfig();
    const player = this.gameCoreStore.activePlayer();
    if (!economyConfig || !player) {
      this.advancePhase(playerId);
      return;
    }

    if (this.pendingOrderAction === 'pressureNeutral') {
      this.attemptInfluence(playerId);
    } else if (player.treasury >= economyConfig.cyberAttackCost) {
      this.aiStore.rollAiCyberAction(playerId);
      switch (this.aiStore.lastAiCyberAction()) {
        case 'hack':
          this.attemptHack(playerId);
          break;
        case 'influence':
          this.attemptInfluence(playerId);
          break;
        case 'sabotage':
          this.attemptSabotage(playerId);
          break;
        case 'none':
        case null:
          break;
      }
    }

    this.applyCyberStateDoctrineSpecial(playerId);
    this.advancePhase(playerId);
  }

  /**
   * Cyber State doctrine special ("shadowCyberOp"): an extra, unauthorized
   * bonus hack on top of whatever the normal roll above did. Reuses the
   * exact same free/bypass mechanism as the Threat Track's freeCyberAttack
   * bonus (AiFreeCyberAttackCommand) rather than a second normal HackCommand
   * dispatch, since a normal hack this same turn would just be rejected —
   * hasUsedCyberAttackThisTurn is already set once the action above runs.
   */
  private applyCyberStateDoctrineSpecial(playerId: string): void {
    const state = this.gameCoreStore.state();
    if (this.pendingOrderAction !== 'doctrineSpecial' || state?.aiConfig?.doctrine !== 'cyberState') {
      return;
    }
    const targetPlayerId = this.decisionEngine.pickHackTarget(state, playerId, this.gameCoreStore.factions(), this.rules);
    if (!targetPlayerId) {
      return;
    }
    this.aiStore.freeCyberAttack(playerId, targetPlayerId);
    const playerName = this.gameCoreStore.activePlayer()?.displayName ?? playerId;
    this.aiStore.narrateAiAction(playerId, `${playerName}'s Cyber State doctrine triggers a shadow cyber attack.`);
  }

  private attemptHack(playerId: string): void {
    const state = this.gameCoreStore.state();
    if (!state) {
      return;
    }
    const targetPlayerId = this.decisionEngine.pickHackTarget(state, playerId, this.gameCoreStore.factions(), this.rules);
    if (!targetPlayerId) {
      return;
    }
    this.cyberAttackStore.hack(playerId, targetPlayerId);
    const playerName = this.gameCoreStore.activePlayer()?.displayName ?? playerId;
    const targetName = state.players.find((candidate) => candidate.id === targetPlayerId)?.displayName ?? targetPlayerId;
    this.aiStore.narrateAiAction(playerId, `${playerName} attempts to hack ${targetName}.`);
  }

  private attemptInfluence(playerId: string): void {
    const state = this.gameCoreStore.state();
    if (!state) {
      return;
    }
    const targetRegionId = this.decisionEngine.pickInfluenceTarget(state, playerId, this.rules);
    if (!targetRegionId) {
      return;
    }
    this.cyberAttackStore.politicalInfluence(playerId, targetRegionId);
    const playerName = this.gameCoreStore.activePlayer()?.displayName ?? playerId;
    const regionName = this.gameCoreStore.regions()[targetRegionId]?.name ?? targetRegionId;
    this.aiStore.narrateAiAction(playerId, `${playerName} attempts Political Influence on ${regionName}.`);
  }

  private attemptSabotage(playerId: string): void {
    const state = this.gameCoreStore.state();
    if (!state) {
      return;
    }
    const targetRegionId = this.decisionEngine.pickRichestEnemyRegion(state, playerId, this.gameCoreStore.factions(), this.rules);
    const targetPlayerId = targetRegionId ? state.regions[targetRegionId]?.ownerId : null;
    if (!targetRegionId || !targetPlayerId) {
      return;
    }
    this.aiStore.aiSabotage(playerId, targetPlayerId, targetRegionId);
    const playerName = this.gameCoreStore.activePlayer()?.displayName ?? playerId;
    const targetName = state.players.find((candidate) => candidate.id === targetPlayerId)?.displayName ?? targetPlayerId;
    this.aiStore.narrateAiAction(playerId, `${playerName} sabotages ${targetName}.`);
  }

  /**
   * Rulebook "Attack Phase" step (attack MOVES half): picks at most one land
   * target region this turn, chosen by whichever order action was rolled at
   * Buy Units entry (attackNearest/RichestAdjacent/WeakestAdjacent —
   * reinforce/pressure-neutral don't attack yet, future build steps).
   * Aggressor's doctrine special ("bypassAttackConditions") is the one
   * exception: when this turn's order was the doctrine-special roll and the
   * doctrine is Aggressor, it attacks like attackNearest but skips the
   * Attack Conditions gate entirely. A naval assault (load a unit onto a
   * transport, sail it — reusing the naval-repositioning-during-Attack-Moves
   * capability — and unload as an amphibious assault) is always attempted
   * IN ADDITION to the land attack above, not merely as a fallback for "no
   * land target found": it draws on a separate pool of units (an embarked
   * passenger + its transport), so there's no resource conflict, and gating
   * it strictly behind "zero land options" made it vanishingly rare in
   * practice — any faction with even one land-adjacent exclave (e.g. a
   * forward garrison) would win target selection every single turn, so its
   * main invasion fleet would sit idle indefinitely. Threat Track's "Total
   * War" (aiConfig.totalWarActive) doubles this to two separate attack
   * attempts, each re-reading state fresh so the second attempt sees
   * whatever the first one changed.
   */
  private runAttackMoves(playerId: string): void {
    const conditionsData = this.aiStore.aiAttackConditions();
    if (!this.pendingOrderAction || !conditionsData) {
      this.advancePhase(playerId);
      return;
    }

    const attackAttempts = this.gameCoreStore.state()?.aiConfig?.totalWarActive ? 2 : 1;
    for (let attempt = 0; attempt < attackAttempts; attempt += 1) {
      const state = this.gameCoreStore.state();
      if (!state) {
        break;
      }
      this.attemptOneAttack(playerId, state, this.pendingOrderAction, conditionsData);
    }

    this.advancePhase(playerId);
  }

  private attemptOneAttack(
    playerId: string,
    state: GameState,
    orderAction: AiOrderAction,
    conditionsData: AiAttackConditionsData,
  ): void {
    const isAggressorSpecial = orderAction === 'doctrineSpecial' && state.aiConfig?.doctrine === 'aggressor';
    const effectiveAction = isAggressorSpecial ? 'attackNearest' : orderAction;

    const attackFlavored: readonly AiOrderAction[] = ['attackNearest', 'attackRichestAdjacent', 'attackWeakestAdjacent'];
    if (!attackFlavored.includes(effectiveAction)) {
      return;
    }

    const targetRegionId = this.decisionEngine.pickAttackTargetRegion(
      state,
      playerId,
      effectiveAction,
      this.gameCoreStore.units(),
      this.gameCoreStore.factions(),
      this.rules,
    );
    if (targetRegionId) {
      this.commitLandAttack(playerId, state, targetRegionId, conditionsData, isAggressorSpecial);
    }

    // Re-read state fresh — commitLandAttack above may have just changed it
    // (units moved, a region captured) — before independently attempting a
    // naval assault this same attack attempt.
    const freshState = this.gameCoreStore.state();
    if (freshState) {
      this.attemptNavalAssault(playerId, freshState, conditionsData, isAggressorSpecial);
    }
  }

  private commitLandAttack(
    playerId: string,
    state: GameState,
    targetRegionId: string,
    conditionsData: AiAttackConditionsData,
    bypassConditions = false,
  ): void {
    const committingUnitIds = this.decisionEngine.getCommittingUnitIds(
      state,
      playerId,
      targetRegionId,
      this.gameCoreStore.units(),
      this.gameCoreStore.factions(),
      this.rules,
    );
    const shouldAttack =
      bypassConditions ||
      this.decisionEngine.evaluateAttackConditions(
        state,
        playerId,
        targetRegionId,
        committingUnitIds,
        this.gameCoreStore.units(),
        this.gameCoreStore.factions(),
        conditionsData,
        this.rules,
      );
    if (!shouldAttack || committingUnitIds.length === 0) {
      return;
    }
    const isDefended = this.rules.getUnitsInRegion(state, targetRegionId).some((unit) => unit.ownerId !== playerId);
    const unitsToSend = isDefended ? committingUnitIds : committingUnitIds.slice(0, 1);
    for (const unitInstanceId of unitsToSend) {
      this.movementStore.attackRegion(playerId, unitInstanceId, targetRegionId);
    }
    this.narrateAttack(playerId, targetRegionId);
  }

  private attemptNavalAssault(
    playerId: string,
    state: GameState,
    conditionsData: AiAttackConditionsData,
    bypassConditions = false,
  ): void {
    const plan = this.decisionEngine.pickNavalAssaultPlan(
      state,
      playerId,
      this.gameCoreStore.units(),
      this.gameCoreStore.factions(),
      this.rules,
    );
    if (!plan) {
      return;
    }
    const shouldAttack =
      bypassConditions ||
      this.decisionEngine.evaluateAttackConditions(
        state,
        playerId,
        plan.targetRegionId,
        [plan.passengerUnitId],
        this.gameCoreStore.units(),
        this.gameCoreStore.factions(),
        conditionsData,
        this.rules,
      );
    if (!shouldAttack) {
      return;
    }

    this.movementStore.loadUnit(playerId, plan.passengerUnitId, plan.transportUnitId);
    const transportNow = this.gameCoreStore.state()?.units.find((unit) => unit.id === plan.transportUnitId);
    if (transportNow && transportNow.regionId !== plan.sailToSeaZoneId) {
      this.movementStore.moveUnit(playerId, plan.transportUnitId, plan.sailToSeaZoneId);
    }
    this.movementStore.unloadUnit(playerId, plan.passengerUnitId, plan.targetRegionId);
    this.narrateAttack(playerId, plan.targetRegionId);
  }

  private narrateAttack(playerId: string, targetRegionId: string): void {
    const playerName = this.gameCoreStore.activePlayer()?.displayName ?? playerId;
    const regionName = this.gameCoreStore.regions()[targetRegionId]?.name ?? targetRegionId;
    this.aiStore.narrateAiAction(playerId, `${playerName} attacks ${regionName}.`);
  }

  /**
   * Rulebook "Attack Phase" step (combat resolution half): resolves every
   * region this player is attacking (rollCombat, then removeCasualty
   * whenever a casualty step is pending, choosing via
   * AiDecisionEngine.pickCasualtyUnit) until each is fully decided — the
   * same gate AdvancePhaseCommand already holds a human to, never bypassed.
   * Missile sub-phases ('missileChoice'/'missileRoll') are future build
   * steps (the AI never declares a strike yet, so these should never occur
   * from the AI's own attacks) — resolveCombatInRegion bails out rather than
   * looping forever if one is ever encountered.
   */
  private runAttackPhase(playerId: string): void {
    const state = this.gameCoreStore.state();
    if (state) {
      for (const regionId of this.rules.getContestedRegionIds(state, playerId, this.gameCoreStore.factions())) {
        this.resolveCombatInRegion(playerId, regionId);
      }
    }
    this.advancePhase(playerId);
  }

  private resolveCombatInRegion(playerId: string, regionId: string): void {
    const unitCatalog = this.gameCoreStore.units();
    for (let step = 0; step < MAX_COMBAT_STEPS_PER_REGION; step += 1) {
      const state = this.gameCoreStore.state();
      if (!state) {
        return;
      }
      // The fight is over once either side has no units left AND there's no
      // pending combat step still to process. Unit count alone isn't enough:
      // combat is a SIMULTANEOUS exchange (RollCombatCommand), so a round
      // where both sides land a hit leaves the defender's casualty processed
      // first while the attacker's own pending casualty is still queued —
      // right after removing the last defender, defenders.length is already
      // 0 even though state.combats[regionId] is still very much alive
      // (step: 'attackerCasualty'), and stopping here would leave that
      // casualty un-applied (a unit that should have died survives) and the
      // stale combat entry dangling in state forever. state.combats[regionId]
      // being undefined is what actually means "nothing left to do" — it's
      // also true before the very first roll (RollCombatCommand creates the
      // entry lazily), which is why unit presence is checked too, so this
      // doesn't return instantly without ever rolling a single die.
      // Embarked land/support cargo is filtered out here too (not just in
      // RollCombatCommand) — it never fought, so it can never legally be the
      // casualty pickCasualtyUnit below chooses. Without this, "cheapest
      // unit dies first" would happily nominate a cheap embarked Infantry
      // riding on a naval battle's transport, RemoveCasualtyCommand would
      // reject it every single time (rejects non-participants), and this
      // loop would spin on the same rejected pick until MAX_COMBAT_STEPS_PER_REGION
      // gives up — leaving the battle permanently unresolved.
      const attackers = state.units.filter(
        (unit) => unit.regionId === regionId && unit.ownerId === playerId && this.rules.isCombatParticipant(unit, unitCatalog),
      );
      const defenders = state.units.filter(
        (unit) => unit.regionId === regionId && unit.ownerId !== playerId && this.rules.isCombatParticipant(unit, unitCatalog),
      );
      if ((attackers.length === 0 || defenders.length === 0) && !state.combats[regionId]) {
        return;
      }

      const combatStep = state.combats[regionId]?.step ?? 'attackerRoll';
      switch (combatStep) {
        case 'attackerRoll':
        case 'defenderRoll':
          this.combatStore.rollCombat(playerId, regionId);
          break;
        case 'missileCasualty':
        case 'defenderCasualty':
          this.combatStore.removeCasualty(playerId, regionId, this.decisionEngine.pickCasualtyUnit(defenders, unitCatalog));
          break;
        case 'attackerCasualty':
          this.combatStore.removeCasualty(playerId, regionId, this.decisionEngine.pickCasualtyUnit(attackers, unitCatalog));
          break;
        case 'missileChoice':
        case 'missileRoll':
          return;
      }
    }
    // eslint-disable-next-line no-console
    console.error(
      `[AiTurnService] Combat in region "${regionId}" did not resolve within ${MAX_COMBAT_STEPS_PER_REGION} steps.`,
    );
  }

  /** Rulebook "Tactical Moves": relocate every unit that didn't fight this turn toward the nearest high-value front, skipping any unit the heuristic has no improvement for. */
  private runTacticalMoves(playerId: string): void {
    const state = this.gameCoreStore.state();
    if (state) {
      const eligibleUnitIds = state.units
        .filter((unit) => unit.ownerId === playerId && !unit.hasFoughtThisTurn && unit.movesRemaining > 0)
        .map((unit) => unit.id);

      for (const unitInstanceId of eligibleUnitIds) {
        const freshState = this.gameCoreStore.state();
        const unit = freshState?.units.find((candidate) => candidate.id === unitInstanceId);
        if (!freshState || !unit || unit.movesRemaining <= 0) {
          continue;
        }
        const destination = this.decisionEngine.pickTacticalDestination(
          freshState,
          unit,
          this.gameCoreStore.units(),
          this.gameCoreStore.factions(),
          this.rules,
        );
        if (destination) {
          this.movementStore.moveUnit(playerId, unitInstanceId, destination);
        }
      }
    }
    this.advancePhase(playerId);
  }

  /**
   * Rulebook "Spawn Units": deploy every Reserve unit into a still-capacity
   * region, skipping any unit type with no legal destination right now
   * rather than getting stuck (it stays in Reserve for a future Place New
   * Units phase). Fortress's doctrine special ("reinforce the frontline"):
   * when this turn's order was the doctrine-special roll and the doctrine is
   * Fortress, picks the destination with the highest frontline exposure
   * among the legal options instead of just the first.
   */
  private runPlaceNewUnits(playerId: string): void {
    const entryState = this.gameCoreStore.state();
    const entryPlayer = entryState?.players.find((candidate) => candidate.id === playerId);
    const unitIds = entryPlayer?.reserve.map((entry) => entry.unitId) ?? [];
    const fortressSpecialActive =
      this.pendingOrderAction === 'doctrineSpecial' && entryState?.aiConfig?.doctrine === 'fortress';

    for (const unitId of unitIds) {
      for (let deployed = 0; deployed < MAX_DEPLOYS_PER_UNIT_TYPE; deployed += 1) {
        const state = this.gameCoreStore.state();
        const player = state?.players.find((candidate) => candidate.id === playerId);
        const quantity = player?.reserve.find((entry) => entry.unitId === unitId)?.quantity ?? 0;
        if (quantity <= 0) {
          break;
        }
        const destinations = this.movementStore.deployDestinations(unitId);
        if (destinations.length === 0) {
          break;
        }
        const destination =
          fortressSpecialActive && state
            ? (this.decisionEngine.pickMostThreatenedDestination(state, playerId, destinations, this.rules) ?? destinations[0])
            : destinations[0];
        this.movementStore.deployUnit(playerId, unitId, destination);
      }
    }

    this.advancePhase(playerId);
  }
}
