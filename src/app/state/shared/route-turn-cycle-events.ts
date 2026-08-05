import { GameEngineEvent } from '../../interfaces/game-events';
import { MapUiStore } from '../map/map-ui.store';
import { CombatStore } from '../combat/combat.store';
import { MovementStore } from '../movement/movement.store';
import { EconomyStore } from '../economy/economy.store';
import { CyberAttackStore } from '../cyber/cyber-attack.store';

/**
 * Forwards the events returned by `GameCoreStore.advancePhase()`/`endTurn()`
 * to every feature store whose `reactToEvents` cares — those two turn-cycle
 * commands can emit almost anything (RegionContested, CasualtyRemoved,
 * HackResolved, ...), so unlike a single-concern store's own dispatch, there
 * is no narrower subset to forward. Shared by AdvancePhaseBarComponent (a
 * human clicking "Advance Phase"/"End Turn") and AiTurnService (the same two
 * commands, driven programmatically) — the only two callers of
 * `GameCoreStore.advancePhase()`/`endTurn()`.
 */
export function routeTurnCycleEvents(
  events: readonly GameEngineEvent[],
  stores: {
    readonly mapUiStore: InstanceType<typeof MapUiStore>;
    readonly combatStore: InstanceType<typeof CombatStore>;
    readonly movementStore: InstanceType<typeof MovementStore>;
    readonly economyStore: InstanceType<typeof EconomyStore>;
    readonly cyberAttackStore: InstanceType<typeof CyberAttackStore>;
  },
): void {
  stores.mapUiStore.reactToEvents(events);
  stores.combatStore.reactToEvents(events);
  stores.movementStore.reactToEvents(events);
  stores.economyStore.reactToEvents(events);
  stores.cyberAttackStore.reactToEvents(events);
}
