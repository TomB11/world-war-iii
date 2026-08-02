import { GamePhase } from '../models/game-state.model';
import { AiOrderAction } from '../models/ai-order.model';
import { AiCyberAction } from '../models/ai-cyber-action.model';
import { ThreatThreshold } from '../models/ai-threat-track.model';
import { AiSabotageEffect } from '../models/ai-sabotage.model';
import { MissileOutcome } from '../models/region-combat.model';

/**
 * Events emitted by the Game Engine. The UI subscribes to these but never
 * causes state changes directly (see CODING_STANDARDS.md section 7).
 * Additional event types are appended here as later phases add commands.
 */

export interface RegionSelectedEvent {
  readonly type: 'RegionSelected';
  readonly regionId: string;
}

export interface RegionDeselectedEvent {
  readonly type: 'RegionDeselected';
}

export interface IncomeCollectedEvent {
  readonly type: 'IncomeCollected';
  readonly playerId: string;
  readonly amount: number;
}

export interface UnitPurchasedEvent {
  readonly type: 'UnitPurchased';
  readonly playerId: string;
  readonly unitId: string;
  readonly quantity: number;
}

export interface PurchaseRejectedEvent {
  readonly type: 'PurchaseRejected';
  readonly playerId: string;
  readonly reason: string;
}

export interface PhaseAdvancedEvent {
  readonly type: 'PhaseAdvanced';
  readonly phase: GamePhase;
}

export interface TurnEndedEvent {
  readonly type: 'TurnEnded';
  readonly previousPlayerId: string;
  readonly nextPlayerId: string;
  readonly turnNumber: number;
}

export interface UnitDeployedEvent {
  readonly type: 'UnitDeployed';
  readonly playerId: string;
  readonly unitInstanceId: string;
  readonly unitId: string;
  readonly regionId: string;
}

export interface UnitMovedEvent {
  readonly type: 'UnitMoved';
  readonly unitInstanceId: string;
  readonly fromRegionId: string;
  readonly toRegionId: string;
}

export interface UnitLoadedEvent {
  readonly type: 'UnitLoaded';
  readonly unitInstanceId: string;
  readonly transportInstanceId: string;
}

export interface UnitUnloadedEvent {
  readonly type: 'UnitUnloaded';
  readonly unitInstanceId: string;
}

export interface MovementRejectedEvent {
  readonly type: 'MovementRejected';
  readonly playerId: string;
  readonly reason: string;
}

export interface RegionCapturedEvent {
  readonly type: 'RegionCaptured';
  readonly playerId: string;
  readonly regionId: string;
  readonly previousOwnerId: string | null;
}

/** A unit moved into a defended region (the combat move) — both armies now co-locate, awaiting combat resolution (PROJECT_RULES.md sections 7/8). */
export interface RegionContestedEvent {
  readonly type: 'RegionContested';
  readonly playerId: string;
  readonly regionId: string;
}

/** A Rocket System declared a supporting missile strike on a region its own side is already attacking (PROJECT_RULES.md section 15) — the launcher stays put. */
export interface MissileStrikeDeclaredEvent {
  readonly type: 'MissileStrikeDeclared';
  readonly playerId: string;
  readonly regionId: string;
  readonly unitInstanceId: string;
}

export interface CitizenSatisfactionChangedEvent {
  readonly type: 'CitizenSatisfactionChanged';
  readonly playerId: string;
  readonly citizenSatisfaction: number;
  readonly rebellionLevel: number;
}

export interface RebelArmySpawnedEvent {
  readonly type: 'RebelArmySpawned';
  readonly playerId: string;
  readonly regionId: string;
}

export interface PublicSpendingRejectedEvent {
  readonly type: 'PublicSpendingRejected';
  readonly playerId: string;
  readonly reason: string;
}

export interface CyberAttackRejectedEvent {
  readonly type: 'CyberAttackRejected';
  readonly playerId: string;
  readonly reason: string;
}

export interface HackResolvedEvent {
  readonly type: 'HackResolved';
  readonly playerId: string;
  readonly targetPlayerId: string;
  readonly attackRoll: number;
  readonly succeeded: boolean;
  readonly moneyStolen: number;
}

export interface PoliticalInfluenceResolvedEvent {
  readonly type: 'PoliticalInfluenceResolved';
  readonly playerId: string;
  readonly regionId: string;
  readonly roll: number;
  readonly succeeded: boolean;
  readonly capturedRegion: boolean;
}

export interface HackLevelUpgradedEvent {
  readonly type: 'HackLevelUpgraded';
  readonly playerId: string;
  readonly hackLevel: number;
}

export interface CombatRejectedEvent {
  readonly type: 'CombatRejected';
  readonly playerId: string;
  readonly reason: string;
}

export interface CombatRoundRolledEvent {
  readonly type: 'CombatRoundRolled';
  readonly regionId: string;
}

/** A previously-declared missile strike was fired (FireMissileCommand) — carries the launcher's region alongside the battle's, purely so the map can animate a projectile traveling between them (CombatRoundRolled alone doesn't distinguish "this round was a missile" from an ordinary die roll). */
export interface MissileFiredEvent {
  readonly type: 'MissileFired';
  readonly regionId: string;
  readonly launcherRegionId: string;
}

export interface CasualtyRemovedEvent {
  readonly type: 'CasualtyRemoved';
  readonly regionId: string;
  readonly unitInstanceId: string;
}

export interface PhaseAdvanceRejectedEvent {
  readonly type: 'PhaseAdvanceRejected';
  readonly playerId: string;
  readonly reason: string;
}

/** A region's Attack Phase battle finished — either the defenders were wiped (region captured by force) or the attackers were wiped (attack repelled). */
export interface RegionCombatResolvedEvent {
  readonly type: 'RegionCombatResolved';
  readonly regionId: string;
  readonly attackerId: string;
  readonly captured: boolean;
}

/** Solo Command Mode: the AI rolled its Purchase Chart for this Buy Units phase (see engine/commands/roll-ai-purchase-chart.command.ts). */
export interface AiPurchaseChartRolledEvent {
  readonly type: 'AiPurchaseChartRolled';
  readonly playerId: string;
  readonly roll: number;
  readonly specialRoll: number | null;
  readonly unitIds: readonly string[];
}

/** Solo Command Mode: the AI rolled its "Determine AI Order" die for this turn (see engine/commands/roll-ai-order.command.ts). */
export interface AiOrderRolledEvent {
  readonly type: 'AiOrderRolled';
  readonly playerId: string;
  readonly roll: number;
  readonly action: AiOrderAction;
}

/** Solo Command Mode: the AI rolled its Cyber & Political Action for this Cyber Attack Phase (see engine/commands/roll-ai-cyber-action.command.ts). */
export interface AiCyberActionRolledEvent {
  readonly type: 'AiCyberActionRolled';
  readonly playerId: string;
  readonly roll: number;
  readonly action: AiCyberAction;
}

/** Solo Command Mode: the shared AI Threat Track increased by 1 (see engine/commands/increment-threat.command.ts). */
export interface ThreatIncreasedEvent {
  readonly type: 'ThreatIncreased';
  readonly playerId: string;
  readonly newLevel: number;
  readonly crossedThreshold: ThreatThreshold | null;
}

/** Solo Command Mode: a one-time bonus (or difficulty preset) credited treasury with no cost (see engine/commands/grant-free-treasury.command.ts). */
export interface TreasuryGrantedEvent {
  readonly type: 'TreasuryGranted';
  readonly playerId: string;
  readonly amount: number;
  readonly reason: string;
}

/** Solo Command Mode: units were added to Reserve with no cost (see engine/commands/grant-free-units.command.ts). */
export interface FreeUnitsGrantedEvent {
  readonly type: 'FreeUnitsGranted';
  readonly playerId: string;
  readonly unitId: string;
  readonly quantity: number;
}

/** Solo Command Mode: a Threat Track / Nightmare-difficulty bonus hack resolved outside the normal Cyber Attack cost/slot (see engine/commands/ai-free-cyber-attack.command.ts). */
export interface AiFreeCyberAttackResolvedEvent {
  readonly type: 'AiFreeCyberAttackResolved';
  readonly playerId: string;
  readonly targetPlayerId: string;
  readonly attackRoll: number;
  readonly succeeded: boolean;
  readonly moneyStolen: number;
}

/** Solo Command Mode: a Sabotage action resolved against the richest enemy region's owner (see engine/commands/ai-sabotage.command.ts). */
export interface AiSabotageResolvedEvent {
  readonly type: 'AiSabotageResolved';
  readonly playerId: string;
  readonly targetPlayerId: string;
  readonly targetRegionId: string;
  readonly effect: AiSabotageEffect;
}

/** Solo Command Mode: the Threat Track's free missile strike bonus resolved as a stand-alone bombardment (see engine/commands/apply-free-missile-strike.command.ts). */
export interface FreeMissileStrikeResolvedEvent {
  readonly type: 'FreeMissileStrikeResolved';
  readonly playerId: string;
  readonly targetRegionId: string;
  readonly missileId: string;
  readonly outcome: MissileOutcome;
  readonly destroyedUnitInstanceId: string | null;
}

export type GameEngineEvent =
  | RegionSelectedEvent
  | RegionDeselectedEvent
  | IncomeCollectedEvent
  | UnitPurchasedEvent
  | PurchaseRejectedEvent
  | PhaseAdvancedEvent
  | TurnEndedEvent
  | UnitDeployedEvent
  | UnitMovedEvent
  | UnitLoadedEvent
  | UnitUnloadedEvent
  | MovementRejectedEvent
  | RegionCapturedEvent
  | RegionContestedEvent
  | MissileStrikeDeclaredEvent
  | CitizenSatisfactionChangedEvent
  | RebelArmySpawnedEvent
  | PublicSpendingRejectedEvent
  | CyberAttackRejectedEvent
  | HackResolvedEvent
  | PoliticalInfluenceResolvedEvent
  | HackLevelUpgradedEvent
  | CombatRejectedEvent
  | CombatRoundRolledEvent
  | MissileFiredEvent
  | CasualtyRemovedEvent
  | PhaseAdvanceRejectedEvent
  | RegionCombatResolvedEvent
  | AiPurchaseChartRolledEvent
  | AiOrderRolledEvent
  | AiCyberActionRolledEvent
  | ThreatIncreasedEvent
  | TreasuryGrantedEvent
  | FreeUnitsGrantedEvent
  | AiFreeCyberAttackResolvedEvent
  | AiSabotageResolvedEvent
  | FreeMissileStrikeResolvedEvent;
