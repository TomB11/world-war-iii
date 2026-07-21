import { GameState } from '../models/game-state.model';
import { GameEngineEvent } from './game-events';

/**
 * Every command returns the (possibly unchanged) next state plus the events
 * that occurred, per CODING_STANDARDS.md section 6/7. Commands never mutate
 * the state object they are given — they return a new one.
 */
export interface CommandResult {
  readonly state: GameState;
  readonly events: readonly GameEngineEvent[];
}

export interface Command {
  readonly type: string;
  execute(state: GameState): CommandResult;
}
