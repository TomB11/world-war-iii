import { GameState } from '../models/game-state.model';
import { Command, CommandResult } from '../interfaces/command';

/**
 * The Game Engine is the single authority allowed to produce a new GameState.
 * It must stay pure TypeScript: no Angular imports, no DOM access, no UI
 * logic (CODING_STANDARDS.md section 5). It is deterministic and unit
 * testable in isolation from the Angular app.
 */
export class GameEngine {
  execute(state: GameState, command: Command): CommandResult {
    try {
      return command.execute(state);
    } catch (error) {
      // Errors must never crash the engine silently or leave state
      // corrupted (CODING_STANDARDS.md section 13): fall back to the
      // untouched prior state and no events.
      // eslint-disable-next-line no-console
      console.error(`[GameEngine] Command "${command.type}" failed:`, error);
      return { state, events: [] };
    }
  }
}
