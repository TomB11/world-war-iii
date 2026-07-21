import { GamePhase } from '../models/game-state.model';

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

export interface UnitUpgradedEvent {
  readonly type: 'UnitUpgraded';
  readonly playerId: string;
  readonly unitInstanceId: string;
  readonly toUnitId: string;
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
  | CitizenSatisfactionChangedEvent
  | RebelArmySpawnedEvent
  | PublicSpendingRejectedEvent
  | CyberAttackRejectedEvent
  | HackResolvedEvent
  | PoliticalInfluenceResolvedEvent
  | HackLevelUpgradedEvent
  | UnitUpgradedEvent
  | CombatRejectedEvent
  | CombatRoundRolledEvent
  | CasualtyRemovedEvent
  | PhaseAdvanceRejectedEvent
  | RegionCombatResolvedEvent;
