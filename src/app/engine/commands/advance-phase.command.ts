import { Command, CommandResult } from '../../interfaces/command';
import { GameState } from '../../models/game-state.model';
import { GameEngineEvent } from '../../interfaces/game-events';
import { TURN_PHASE_ORDER } from '../../core/constants/game.constants';
import { UnitDefinition } from '../../models/unit.model';
import { Faction } from '../../models/faction.model';
import { RulesEngine } from '../rules-engine';

/**
 * Steps the active player's turn forward one phase within the fixed cycle
 * (PROJECT_RULES.md section 3). Does not move past 'collectIncome' (the
 * last phase) — that transition to the next player belongs to
 * EndTurnCommand. Only the active player may advance their own turn;
 * anything else is a structured no-op. Entering the Attack Moves Phase
 * refreshes the active player's units back to their catalog movement value
 * (Tactical Moves reuses the same per-turn pool — see MOVEMENT_PHASES) and
 * clears hasFoughtThisTurn, so last turn's combat doesn't block this
 * turn's Tactical Moves. Entering the Cyber Attack Phase clears
 * hasUsedCyberAttackThisTurn, so last round's Hack/Political Influence
 * doesn't block this round's (PROJECT_RULES.md section 6). Entering the
 * Place New Units Phase clears unitsDeployedThisTurn, so last turn's
 * factory usage doesn't carry over (PROJECT_RULES.md section 18). Leaving
 * Place New Units (into Collect Income) clears any Solo Command Mode
 * Sabotage "spawn block" on regions this player owns — see
 * GameState.sabotagedRegionIds.
 */
export class AdvancePhaseCommand implements Command {
  readonly type = 'AdvancePhase';

  constructor(
    private readonly playerId: string,
    private readonly unitCatalog: Readonly<Record<string, UnitDefinition>> = {},
    private readonly factions: Readonly<Record<string, Faction>> = {},
    private readonly rules: RulesEngine = new RulesEngine(),
  ) {}

  execute(state: GameState): CommandResult {
    if (state.activePlayerId !== this.playerId) {
      return { state, events: [] };
    }

    if (
      state.phase === 'attack' &&
      this.rules.getContestedRegionIds(state, this.playerId, this.factions).length > 0
    ) {
      return {
        state,
        events: [
          {
            type: 'PhaseAdvanceRejected',
            playerId: this.playerId,
            reason: 'Resolve all pending battles before advancing.',
          },
        ],
      };
    }

    const currentIndex = TURN_PHASE_ORDER.indexOf(state.phase);
    const nextIndex = currentIndex + 1;
    if (currentIndex === -1 || nextIndex >= TURN_PHASE_ORDER.length) {
      return { state, events: [] };
    }

    const nextPhase = TURN_PHASE_ORDER[nextIndex];
    const nextUnits =
      nextPhase === 'attackMoves'
        ? state.units.map((unit) =>
            unit.ownerId === this.playerId
              ? {
                  ...unit,
                  movesRemaining: this.unitCatalog[unit.unitId]?.movement ?? unit.movesRemaining,
                  hasFoughtThisTurn: false,
                }
              : unit,
          )
        : state.units;
    const nextPlayers =
      nextPhase === 'cyberAttack'
        ? state.players.map((player) =>
            player.id === this.playerId ? { ...player, hasUsedCyberAttackThisTurn: false } : player,
          )
        : state.players;
    const nextUnitsDeployedThisTurn = nextPhase === 'placeNewUnits' ? {} : state.unitsDeployedThisTurn;
    // Solo Command Mode: a Sabotage "spawn block" only lasts until the
    // victim's own next Place New Units phase ends — clear entries for
    // regions THIS departing player owns (regardless of who sabotaged them),
    // not a blanket clear, since other players' still-active blocks must
    // survive until their own placeNewUnits phase comes around.
    const nextSabotagedRegionIds =
      nextPhase === 'collectIncome'
        ? state.sabotagedRegionIds.filter((regionId) => state.regions[regionId]?.ownerId !== this.playerId)
        : state.sabotagedRegionIds;

    const events: readonly GameEngineEvent[] = [{ type: 'PhaseAdvanced', phase: nextPhase }];
    return {
      state: {
        ...state,
        phase: nextPhase,
        units: nextUnits,
        players: nextPlayers,
        unitsDeployedThisTurn: nextUnitsDeployedThisTurn,
        sabotagedRegionIds: nextSabotagedRegionIds,
      },
      events,
    };
  }
}
