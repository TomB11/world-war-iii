import { Command, CommandResult } from '../../interfaces/command';
import { GameState } from '../../models/game-state.model';
import { GameEngineEvent } from '../../interfaces/game-events';
import { AiThreatTrackData } from '../../models/ai-threat-track.model';
import { RulesEngine } from '../rules-engine';

/**
 * Solo Command Mode's "Increase Threat by 1" (rulebook section 2, step 1):
 * a single counter shared by the whole AI-controlled alliance
 * (GameState.aiConfig.threatLevel, not per-faction), incremented once at the
 * start of every AI faction's own turn. Capped at threatTrackData.maxLevel —
 * reaching it sets aiConfig.totalWarActive permanently (the rulebook doesn't
 * specify what happens past the top of the track). Crossing a threshold this
 * increment is reported via the emitted event's crossedThreshold, for the
 * caller (services/ai-turn.service.ts) to apply the matching one-time bonus.
 *
 * Also bumps this player's own PlayerState.aiTurnCounter by 1 — a separate,
 * per-faction counter (Nightmare difficulty's "free cyber attack every 2nd
 * turn" needs this, since turnNumber increments once per full round, not per
 * player-turn). Bundled here rather than as its own command since both fire
 * at exactly the same moment (the start of this AI faction's turn) — but
 * unlike threatLevel, this bump must keep happening even once threatLevel
 * itself is already maxed out, so it's applied unconditionally.
 */
export class IncrementThreatCommand implements Command {
  readonly type = 'IncrementThreat';

  constructor(
    private readonly playerId: string,
    private readonly threatTrackData: AiThreatTrackData,
    private readonly rules: RulesEngine = new RulesEngine(),
  ) {}

  execute(state: GameState): CommandResult {
    if (state.activePlayerId !== this.playerId || state.phase !== 'buyUnits' || !state.aiConfig) {
      return { state, events: [] };
    }

    const nextPlayers = state.players.map((candidate) =>
      candidate.id === this.playerId ? { ...candidate, aiTurnCounter: (candidate.aiTurnCounter ?? 0) + 1 } : candidate,
    );

    const currentLevel = state.aiConfig.threatLevel;
    if (currentLevel >= this.threatTrackData.maxLevel) {
      return { state: { ...state, players: nextPlayers }, events: [] };
    }

    const newLevel = currentLevel + 1;
    const crossedThreshold = this.threatTrackData.thresholds.find((threshold) => threshold.level === newLevel) ?? null;
    const totalWarActive = state.aiConfig.totalWarActive || newLevel >= this.threatTrackData.maxLevel;

    const events: readonly GameEngineEvent[] = [
      { type: 'ThreatIncreased', playerId: this.playerId, newLevel, crossedThreshold },
    ];
    return {
      state: {
        ...state,
        players: nextPlayers,
        aiConfig: { ...state.aiConfig, threatLevel: newLevel, totalWarActive },
      },
      events,
    };
  }
}
