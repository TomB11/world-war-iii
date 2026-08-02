import { Command, CommandResult } from '../../interfaces/command';
import { GameState } from '../../models/game-state.model';
import { GameEngineEvent } from '../../interfaces/game-events';
import { RulesEngine } from '../rules-engine';
import { resolveHack } from './shared/hack-resolution';

/**
 * Solo Command Mode: a Threat Track / Nightmare-difficulty bonus hack that
 * skips HackCommand's cost and once-per-turn slot entirely (it's a bonus
 * action, not the turn's normal Cyber Attack action) — reuses the exact same
 * roll/resolve math (engine/commands/shared/hack-resolution.ts) so the two
 * never drift apart. Not phase-gated: a "free" bonus fires the moment it's
 * earned rather than waiting for the Cyber Attack Phase to come around.
 */
export class AiFreeCyberAttackCommand implements Command {
  readonly type = 'AiFreeCyberAttack';

  constructor(
    private readonly playerId: string,
    private readonly targetPlayerId: string,
    private readonly rules: RulesEngine = new RulesEngine(),
  ) {}

  execute(state: GameState): CommandResult {
    if (this.playerId === this.targetPlayerId) {
      return { state, events: [] };
    }
    const target = this.rules.getPlayer(state, this.targetPlayerId);
    if (!target || !this.rules.getPlayer(state, this.playerId)) {
      return { state, events: [] };
    }

    const resolution = resolveHack(state.randomSeed, target.hackLevel, target.treasury);

    const nextPlayers = state.players.map((candidate) => {
      if (candidate.id === this.playerId) {
        return { ...candidate, treasury: candidate.treasury + resolution.moneyStolen };
      }
      if (candidate.id === this.targetPlayerId) {
        return { ...candidate, treasury: candidate.treasury - resolution.moneyStolen };
      }
      return candidate;
    });

    const events: readonly GameEngineEvent[] = [
      {
        type: 'AiFreeCyberAttackResolved',
        playerId: this.playerId,
        targetPlayerId: this.targetPlayerId,
        attackRoll: resolution.attackRoll,
        succeeded: resolution.succeeded,
        moneyStolen: resolution.moneyStolen,
      },
    ];
    return { state: { ...state, players: nextPlayers, randomSeed: resolution.nextSeed }, events };
  }
}
