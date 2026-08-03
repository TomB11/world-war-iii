import { Injectable, effect, inject } from '@angular/core';
import { GameStore } from '../state/store';
import { GamePhase, GameState } from '../models/game-state.model';
import { AiOrderAction } from '../models/ai-order.model';
import { AiAttackConditionsData } from '../models/ai-attack-conditions.model';
import { AiDecisionEngine } from '../engine/ai/ai-decision-engine';
import { RulesEngine } from '../engine/rules-engine';

/**
 * Hard bailout against an AI faction with no legal action anywhere in some
 * phase (should never happen, but CODING_STANDARDS.md section 13 — never
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
 * turn using ONLY GameStore's existing public dispatch methods — never
 * bypassing the Command pattern, exactly like a human UI action would.
 * GameStore.dispatch() is fully synchronous, so a whole back-to-back run of
 * AI factions completes within one JS task: near-instant, then presented to
 * the human as a single dismissable per-faction summary
 * (GameStore.narrateAiAction / beginAiTurnLog / finishAiTurnLog /
 * AiTurnSummaryComponent) they review at their own pace before continuing —
 * not transient toasts, and not animated step-by-step.
 *
 * Provided in root and force-instantiated once from GameScreenComponent
 * (same pattern GameStore itself already uses) so its constructor effect()
 * starts watching state immediately.
 */
@Injectable({ providedIn: 'root' })
export class AiTurnService {
  private readonly store = inject(GameStore);
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
      this.store.state();
      if (!this.running && this.store.isActivePlayerAiControlled()) {
        this.runAiTurns();
      }
    });
  }

  /** Drives consecutive AI factions' turns back-to-back until control reaches a human player, then hands the human a single dismissable summary of everything every AI faction just did. */
  private runAiTurns(): void {
    this.running = true;
    this.store.beginAiTurnLog();
    try {
      let dispatches = 0;
      while (dispatches < MAX_DISPATCHES_PER_TRIGGER) {
        const state = this.store.state();
        if (!state || !this.store.isActivePlayerAiControlled()) {
          return;
        }
        this.runPhaseStep(state.activePlayerId, state.phase);
        dispatches += 1;
      }
      const stuckState = this.store.state();
      if (stuckState) {
        // eslint-disable-next-line no-console
        console.error(
          `[AiTurnService] Hit the ${MAX_DISPATCHES_PER_TRIGGER}-dispatch cap for player "${stuckState.activePlayerId}" without reaching a human turn — forcing endTurn.`,
        );
        this.store.endTurn(stuckState.activePlayerId);
      }
    } finally {
      this.store.finishAiTurnLog();
      this.running = false;
    }
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
        this.store.endTurn(playerId);
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

    this.store.rollAiOrder(playerId);
    this.pendingOrderAction = this.store.lastAiOrderAction();

    this.store.rollAiPurchaseChart(playerId);
    const rolledUnitIds = this.store.lastAiPurchaseChartUnitIds();

    const bought: string[] = [];
    for (const unitId of rolledUnitIds) {
      const player = this.store.activePlayer();
      const cost = this.store.units()[unitId]?.cost ?? 0;
      if (!player || cost <= 0 || player.treasury < cost) {
        continue;
      }
      this.store.purchaseUnit(playerId, unitId, 1);
      bought.push(unitId);
    }

    if (bought.length > 0) {
      const playerName = this.store.activePlayer()?.displayName ?? playerId;
      const names = bought.map((unitId) => this.store.unitDisplayName(unitId)).join(', ');
      this.store.narrateAiAction(playerId, `${playerName} bought ${names}.`);
    }

    this.store.advancePhase(playerId);
  }

  /**
   * Rulebook "Threat Track": increments the shared counter and applies
   * whichever one-time bonus (if any) was just crossed. 'totalWar' isn't
   * applied here at all: IncrementThreatCommand itself sets the permanent
   * aiConfig.totalWarActive flag, read later by runAttackMoves.
   */
  private applyThreatIncrement(playerId: string): void {
    this.store.incrementThreat(playerId);
    const threshold = this.store.lastThreatCrossedThreshold();
    if (!threshold) {
      return;
    }
    const playerName = this.store.activePlayer()?.displayName ?? playerId;
    switch (threshold.bonus) {
      case 'treasury':
        this.store.grantFreeTreasury(playerId, threshold.amount ?? 0, 'Threat Track');
        this.store.narrateAiAction(playerId, `${playerName}'s Threat Track grants +${threshold.amount ?? 0} treasury.`);
        return;
      case 'freeCyberAttack': {
        const state = this.store.state();
        const targetPlayerId = state ? this.decisionEngine.pickHackTarget(state, playerId, this.store.factions(), this.rules) : null;
        if (targetPlayerId) {
          this.store.freeCyberAttack(playerId, targetPlayerId);
          this.store.narrateAiAction(playerId, `${playerName}'s Threat Track triggers a free cyber attack.`);
        }
        return;
      }
      case 'freeInfantry':
        if (threshold.unitId && threshold.quantity) {
          this.store.grantFreeUnits(playerId, threshold.unitId, threshold.quantity);
          this.store.narrateAiAction(playerId, `${playerName}'s Threat Track grants ${threshold.quantity}x free units.`);
        }
        return;
      case 'freeMissileStrike': {
        const state = this.store.state();
        const targetRegionId = state
          ? this.decisionEngine.pickRichestEnemyRegion(state, playerId, this.store.factions(), this.rules)
          : null;
        if (targetRegionId) {
          this.store.applyFreeMissileStrike(playerId, targetRegionId);
          const regionName = this.store.regions()[targetRegionId]?.name ?? targetRegionId;
          this.store.narrateAiAction(playerId, `${playerName}'s Threat Track triggers a free missile strike on ${regionName}.`);
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
    const preset = this.store.aiDifficultyPreset();
    if (!preset) {
      return;
    }

    if (preset.treasuryPerTurn !== 0) {
      this.store.grantFreeTreasury(playerId, preset.treasuryPerTurn, 'Difficulty');
    }

    if (preset.freeCyberAttackEveryNTurns > 0) {
      const aiTurnCounter = this.store.activePlayer()?.aiTurnCounter ?? 0;
      if (aiTurnCounter > 0 && aiTurnCounter % preset.freeCyberAttackEveryNTurns === 0) {
        const state = this.store.state();
        const targetPlayerId = state ? this.decisionEngine.pickHackTarget(state, playerId, this.store.factions(), this.rules) : null;
        if (targetPlayerId) {
          this.store.freeCyberAttack(playerId, targetPlayerId);
          const playerName = this.store.activePlayer()?.displayName ?? playerId;
          this.store.narrateAiAction(playerId, `${playerName}'s Nightmare difficulty triggers a free cyber attack.`);
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
    const economyConfig = this.store.economyConfig();
    const player = this.store.activePlayer();
    if (!economyConfig || !player) {
      this.store.advancePhase(playerId);
      return;
    }

    if (this.pendingOrderAction === 'pressureNeutral') {
      this.attemptInfluence(playerId);
    } else if (player.treasury >= economyConfig.cyberAttackCost) {
      this.store.rollAiCyberAction(playerId);
      switch (this.store.lastAiCyberAction()) {
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
    this.store.advancePhase(playerId);
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
    const state = this.store.state();
    if (this.pendingOrderAction !== 'doctrineSpecial' || state?.aiConfig?.doctrine !== 'cyberState') {
      return;
    }
    const targetPlayerId = this.decisionEngine.pickHackTarget(state, playerId, this.store.factions(), this.rules);
    if (!targetPlayerId) {
      return;
    }
    this.store.freeCyberAttack(playerId, targetPlayerId);
    const playerName = this.store.activePlayer()?.displayName ?? playerId;
    this.store.narrateAiAction(playerId, `${playerName}'s Cyber State doctrine triggers a shadow cyber attack.`);
  }

  private attemptHack(playerId: string): void {
    const state = this.store.state();
    if (!state) {
      return;
    }
    const targetPlayerId = this.decisionEngine.pickHackTarget(state, playerId, this.store.factions(), this.rules);
    if (!targetPlayerId) {
      return;
    }
    this.store.hack(playerId, targetPlayerId);
    const playerName = this.store.activePlayer()?.displayName ?? playerId;
    const targetName = state.players.find((candidate) => candidate.id === targetPlayerId)?.displayName ?? targetPlayerId;
    this.store.narrateAiAction(playerId, `${playerName} attempts to hack ${targetName}.`);
  }

  private attemptInfluence(playerId: string): void {
    const state = this.store.state();
    if (!state) {
      return;
    }
    const targetRegionId = this.decisionEngine.pickInfluenceTarget(state, playerId, this.rules);
    if (!targetRegionId) {
      return;
    }
    this.store.politicalInfluence(playerId, targetRegionId);
    const playerName = this.store.activePlayer()?.displayName ?? playerId;
    const regionName = this.store.regions()[targetRegionId]?.name ?? targetRegionId;
    this.store.narrateAiAction(playerId, `${playerName} attempts Political Influence on ${regionName}.`);
  }

  private attemptSabotage(playerId: string): void {
    const state = this.store.state();
    if (!state) {
      return;
    }
    const targetRegionId = this.decisionEngine.pickRichestEnemyRegion(state, playerId, this.store.factions(), this.rules);
    const targetPlayerId = targetRegionId ? state.regions[targetRegionId]?.ownerId : null;
    if (!targetRegionId || !targetPlayerId) {
      return;
    }
    this.store.aiSabotage(playerId, targetPlayerId, targetRegionId);
    const playerName = this.store.activePlayer()?.displayName ?? playerId;
    const targetName = state.players.find((candidate) => candidate.id === targetPlayerId)?.displayName ?? targetPlayerId;
    this.store.narrateAiAction(playerId, `${playerName} sabotages ${targetName}.`);
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
    const conditionsData = this.store.aiAttackConditionsData();
    if (!this.pendingOrderAction || !conditionsData) {
      this.store.advancePhase(playerId);
      return;
    }

    const attackAttempts = this.store.state()?.aiConfig?.totalWarActive ? 2 : 1;
    for (let attempt = 0; attempt < attackAttempts; attempt += 1) {
      const state = this.store.state();
      if (!state) {
        break;
      }
      this.attemptOneAttack(playerId, state, this.pendingOrderAction, conditionsData);
    }

    this.store.advancePhase(playerId);
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
      this.store.units(),
      this.store.factions(),
      this.rules,
    );
    if (targetRegionId) {
      this.commitLandAttack(playerId, state, targetRegionId, conditionsData, isAggressorSpecial);
    }

    // Re-read state fresh — commitLandAttack above may have just changed it
    // (units moved, a region captured) — before independently attempting a
    // naval assault this same attack attempt.
    const freshState = this.store.state();
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
      this.store.units(),
      this.store.factions(),
      this.rules,
    );
    const shouldAttack =
      bypassConditions ||
      this.decisionEngine.evaluateAttackConditions(
        state,
        playerId,
        targetRegionId,
        committingUnitIds,
        this.store.units(),
        this.store.factions(),
        conditionsData,
        this.rules,
      );
    if (!shouldAttack || committingUnitIds.length === 0) {
      return;
    }
    const isDefended = this.rules.getUnitsInRegion(state, targetRegionId).some((unit) => unit.ownerId !== playerId);
    const unitsToSend = isDefended ? committingUnitIds : committingUnitIds.slice(0, 1);
    for (const unitInstanceId of unitsToSend) {
      this.store.attackRegion(playerId, unitInstanceId, targetRegionId);
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
      this.store.units(),
      this.store.factions(),
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
        this.store.units(),
        this.store.factions(),
        conditionsData,
        this.rules,
      );
    if (!shouldAttack) {
      return;
    }

    this.store.loadUnit(playerId, plan.passengerUnitId, plan.transportUnitId);
    const transportNow = this.store.state()?.units.find((unit) => unit.id === plan.transportUnitId);
    if (transportNow && transportNow.regionId !== plan.sailToSeaZoneId) {
      this.store.moveUnit(playerId, plan.transportUnitId, plan.sailToSeaZoneId);
    }
    this.store.unloadUnit(playerId, plan.passengerUnitId, plan.targetRegionId);
    this.narrateAttack(playerId, plan.targetRegionId);
  }

  private narrateAttack(playerId: string, targetRegionId: string): void {
    const playerName = this.store.activePlayer()?.displayName ?? playerId;
    const regionName = this.store.regions()[targetRegionId]?.name ?? targetRegionId;
    this.store.narrateAiAction(playerId, `${playerName} attacks ${regionName}.`);
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
    const state = this.store.state();
    if (state) {
      for (const regionId of this.rules.getContestedRegionIds(state, playerId, this.store.factions())) {
        this.resolveCombatInRegion(playerId, regionId);
      }
    }
    this.store.advancePhase(playerId);
  }

  private resolveCombatInRegion(playerId: string, regionId: string): void {
    const unitCatalog = this.store.units();
    for (let step = 0; step < MAX_COMBAT_STEPS_PER_REGION; step += 1) {
      const state = this.store.state();
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
          this.store.rollCombat(playerId, regionId);
          break;
        case 'missileCasualty':
        case 'defenderCasualty':
          this.store.removeCasualty(playerId, regionId, this.decisionEngine.pickCasualtyUnit(defenders, unitCatalog));
          break;
        case 'attackerCasualty':
          this.store.removeCasualty(playerId, regionId, this.decisionEngine.pickCasualtyUnit(attackers, unitCatalog));
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
    const state = this.store.state();
    if (state) {
      const eligibleUnitIds = state.units
        .filter((unit) => unit.ownerId === playerId && !unit.hasFoughtThisTurn && unit.movesRemaining > 0)
        .map((unit) => unit.id);

      for (const unitInstanceId of eligibleUnitIds) {
        const freshState = this.store.state();
        const unit = freshState?.units.find((candidate) => candidate.id === unitInstanceId);
        if (!freshState || !unit || unit.movesRemaining <= 0) {
          continue;
        }
        const destination = this.decisionEngine.pickTacticalDestination(
          freshState,
          unit,
          this.store.units(),
          this.store.factions(),
          this.rules,
        );
        if (destination) {
          this.store.moveUnit(playerId, unitInstanceId, destination);
        }
      }
    }
    this.store.advancePhase(playerId);
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
    const entryState = this.store.state();
    const entryPlayer = entryState?.players.find((candidate) => candidate.id === playerId);
    const unitIds = entryPlayer?.reserve.map((entry) => entry.unitId) ?? [];
    const fortressSpecialActive =
      this.pendingOrderAction === 'doctrineSpecial' && entryState?.aiConfig?.doctrine === 'fortress';

    for (const unitId of unitIds) {
      for (let deployed = 0; deployed < MAX_DEPLOYS_PER_UNIT_TYPE; deployed += 1) {
        const state = this.store.state();
        const player = state?.players.find((candidate) => candidate.id === playerId);
        const quantity = player?.reserve.find((entry) => entry.unitId === unitId)?.quantity ?? 0;
        if (quantity <= 0) {
          break;
        }
        const destinations = this.store.deployDestinations(unitId);
        if (destinations.length === 0) {
          break;
        }
        const destination =
          fortressSpecialActive && state
            ? (this.decisionEngine.pickMostThreatenedDestination(state, playerId, destinations, this.rules) ?? destinations[0])
            : destinations[0];
        this.store.deployUnit(playerId, unitId, destination);
      }
    }

    this.store.advancePhase(playerId);
  }
}
