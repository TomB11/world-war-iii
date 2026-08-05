import { GameState } from '../../models/game-state.model';
import { UnitDefinition } from '../../models/unit.model';
import { UnitInstance } from '../../models/unit-instance.model';
import { Faction } from '../../models/faction.model';
import { RulesEngine } from '../rules-engine';
import { AiOrderAction } from '../../models/ai-order.model';
import { AiAttackConditionsData } from '../../models/ai-attack-conditions.model';
import { getCommittingUnitIds, pickAttackTargetRegion } from './ai-order-targets.util';
import { evaluateAttackConditions } from './ai-attack-conditions';
import { chooseTacticalDestination, pickMostThreatenedDestination } from './ai-tactical-move.util';
import { chooseCasualtyUnit } from './ai-casualty-choice.util';
import { NavalAssaultPlan, pickNavalAssaultPlan } from './ai-naval-assault.util';
import { pickHackTarget, pickInfluenceTarget, pickRichestEnemyRegion } from './ai-cyber-targets.util';

/**
 * Solo Command Mode's decision engine: pure TypeScript, zero Angular/DOM,
 * mirroring RulesEngine's style — answers "what should the AI do" questions
 * for services/ai-turn.service.ts by composing the small pure util files in
 * this folder. It never mutates state or rolls dice itself (that stays in
 * Commands, to keep GameState.randomSeed the sole source of determinism);
 * it only picks *what/who* the orchestration service should then dispatch
 * through GameStore's normal public methods.
 */
export class AiDecisionEngine {
  pickAttackTargetRegion(
    state: GameState,
    playerId: string,
    action: AiOrderAction,
    unitCatalog: Readonly<Record<string, UnitDefinition>>,
    factions: Readonly<Record<string, Faction>>,
    rules: RulesEngine,
  ): string | null {
    return pickAttackTargetRegion(state, playerId, action, unitCatalog, factions, rules);
  }

  getCommittingUnitIds(
    state: GameState,
    playerId: string,
    targetRegionId: string,
    unitCatalog: Readonly<Record<string, UnitDefinition>>,
    factions: Readonly<Record<string, Faction>>,
    rules: RulesEngine,
  ): readonly string[] {
    return getCommittingUnitIds(state, playerId, targetRegionId, unitCatalog, factions, rules);
  }

  evaluateAttackConditions(
    state: GameState,
    playerId: string,
    targetRegionId: string,
    committingUnitIds: readonly string[],
    unitCatalog: Readonly<Record<string, UnitDefinition>>,
    factions: Readonly<Record<string, Faction>>,
    conditionsData: AiAttackConditionsData,
    rules: RulesEngine,
  ): boolean {
    return evaluateAttackConditions(
      state,
      playerId,
      targetRegionId,
      committingUnitIds,
      unitCatalog,
      factions,
      conditionsData,
      rules,
    );
  }

  pickTacticalDestination(
    state: GameState,
    unit: UnitInstance,
    unitCatalog: Readonly<Record<string, UnitDefinition>>,
    factions: Readonly<Record<string, Faction>>,
    rules: RulesEngine,
  ): string | null {
    return chooseTacticalDestination(state, unit, unitCatalog, factions, rules);
  }

  pickCasualtyUnit(candidates: readonly UnitInstance[], unitCatalog: Readonly<Record<string, UnitDefinition>>): string {
    return chooseCasualtyUnit(candidates, unitCatalog);
  }

  pickNavalAssaultPlan(
    state: GameState,
    playerId: string,
    unitCatalog: Readonly<Record<string, UnitDefinition>>,
    factions: Readonly<Record<string, Faction>>,
    rules: RulesEngine,
  ): NavalAssaultPlan | null {
    return pickNavalAssaultPlan(state, playerId, unitCatalog, factions, rules);
  }

  pickHackTarget(
    state: GameState,
    playerId: string,
    factions: Readonly<Record<string, Faction>>,
    rules: RulesEngine,
  ): string | null {
    return pickHackTarget(state, playerId, factions, rules);
  }

  pickInfluenceTarget(state: GameState, playerId: string, rules: RulesEngine): string | null {
    return pickInfluenceTarget(state, playerId, rules);
  }

  pickRichestEnemyRegion(
    state: GameState,
    playerId: string,
    factions: Readonly<Record<string, Faction>>,
    rules: RulesEngine,
  ): string | null {
    return pickRichestEnemyRegion(state, playerId, factions, rules);
  }

  pickMostThreatenedDestination(
    state: GameState,
    playerId: string,
    destinations: readonly string[],
    rules: RulesEngine,
  ): string | null {
    return pickMostThreatenedDestination(state, playerId, destinations, rules);
  }
}
