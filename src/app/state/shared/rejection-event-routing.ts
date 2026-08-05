import { GameEngineEvent } from '../../interfaces/game-events';

/**
 * Event types a specific feature store owns for its OWN rejection/result
 * signal(s) — each such store reacts to these with its own explicit case
 * (setting its reason on a `*Rejected` event, or clearing it on a
 * domain-specific success like `RegionContested`/`HackResolved`). Every
 * OTHER event type (the big "the player's action fully succeeded" moments —
 * `UnitMoved`, `UnitDeployed`, `PhaseAdvanced`, `TurnEnded`, `RegionCaptured`
 * — plus anything not explicitly owned by any store, e.g. `UnitPurchased`,
 * `IncomeCollected`) is treated as "clear every panel's stale rejection
 * banner", matching this codebase's original single `GameStore.applyEvents`
 * switch (pre-@ngrx/signals split) before it was distributed across stores.
 * Kept as one shared list so a newly-added event type that nobody claims
 * automatically clears stale banners by default, instead of silently
 * lingering, exactly like the old switch's `default` case did.
 */
const OWNED_EVENT_TYPES: ReadonlySet<GameEngineEvent['type']> = new Set<GameEngineEvent['type']>([
  'RegionSelected',
  'RegionDeselected',
  'RegionContested',
  'MissileStrikeDeclared',
  'MissileFired',
  'PurchaseRejected',
  'MovementRejected',
  'PublicSpendingRejected',
  'CyberAttackRejected',
  'HackResolved',
  'PoliticalInfluenceResolved',
  'HackLevelUpgraded',
  'CombatRejected',
  'PhaseAdvanceRejected',
  'CombatRoundRolled',
  'CasualtyRemoved',
  'RegionCombatResolved',
  'AiPurchaseChartRolled',
  'AiOrderRolled',
  'AiCyberActionRolled',
  'ThreatIncreased',
  'AiSabotageResolved',
  'FreeMissileStrikeResolved',
]);

/**
 * Whether this event represents a "successful action, clear every rejection
 * banner" moment (see OWNED_EVENT_TYPES doc above). Every rejection-owning
 * store should call this in its own dispatch-result switch's fallback
 * branch, after handling any event types it owns itself.
 */
export function clearsAllRejectionBanners(event: GameEngineEvent): boolean {
  return !OWNED_EVENT_TYPES.has(event.type);
}
