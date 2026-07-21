import { Command, CommandResult } from '../../interfaces/command';
import { GameState } from '../../models/game-state.model';
import { GameEngineEvent } from '../../interfaces/game-events';

/**
 * Selects (or, with null, deselects) a map location — a land Region or a
 * SeaZone. Selection does not mutate GameState itself — ownership/units are
 * untouched — it only validates the target exists and reports the outcome
 * as an event. The Signal Store translates that event into UI-only
 * selection state.
 */
export class SelectRegionCommand implements Command {
  readonly type = 'SelectRegion';

  constructor(private readonly regionId: string | null) {}

  execute(state: GameState): CommandResult {
    if (this.regionId === null) {
      const events: readonly GameEngineEvent[] = [{ type: 'RegionDeselected' }];
      return { state, events };
    }

    const targetExists = this.regionId in state.regions || this.regionId in state.seaZones;
    if (!targetExists) {
      // Invalid selection target: structured no-op, no event emitted.
      return { state, events: [] };
    }

    const events: readonly GameEngineEvent[] = [
      { type: 'RegionSelected', regionId: this.regionId },
    ];
    return { state, events };
  }
}
