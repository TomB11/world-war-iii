import { Command, CommandResult } from '../../interfaces/command';
import { GameState } from '../../models/game-state.model';
import { GameEngineEvent } from '../../interfaces/game-events';
import { EconomyConfig } from '../../models/economy-config.model';
import { RulesEngine } from '../rules-engine';

/**
 * Public Spending (PROJECT_RULES.md section 5): during the Buy Units
 * Phase, the active player may spend treasury to raise their own Citizen
 * Satisfaction, 1 money per 1 point, up to the track's max. Since the
 * marker decays by citizenSatisfactionDecayPerTurn (5) every turn, spending
 * exactly that much just offsets the coming decay; spending more builds a
 * buffer against future drops (rebellion, losing a region by force). If the
 * result crosses back above the rebellion zone, rebellionLevel resets to 0.
 */
export class RaiseCitizenSatisfactionCommand implements Command {
  readonly type = 'RaiseCitizenSatisfaction';

  constructor(
    private readonly playerId: string,
    private readonly amount: number,
    private readonly economyConfig: EconomyConfig,
    private readonly rules: RulesEngine = new RulesEngine(),
  ) {}

  execute(state: GameState): CommandResult {
    const reject = (reason: string): CommandResult => ({
      state,
      events: [{ type: 'PublicSpendingRejected', playerId: this.playerId, reason }],
    });

    if (state.phase !== 'buyUnits') {
      return reject('Public spending is only allowed during the Buy Units Phase');
    }
    if (state.activePlayerId !== this.playerId) {
      return reject('It is not your turn');
    }
    if (!Number.isFinite(this.amount) || this.amount <= 0) {
      return reject('Amount must be a positive number');
    }

    const player = this.rules.getPlayer(state, this.playerId);
    if (!player) {
      return reject(`Unknown player "${this.playerId}"`);
    }
    if (player.treasury < this.amount) {
      return reject(`Not enough treasury (have ${player.treasury}, need ${this.amount})`);
    }

    const newSatisfaction = Math.min(
      this.economyConfig.citizenSatisfactionMax,
      player.citizenSatisfaction + this.amount,
    );
    const rebellionZone = this.economyConfig.citizenSatisfactionZones['rebellion'];
    const clearsRebellion = rebellionZone !== undefined && newSatisfaction > rebellionZone.max;
    const nextRebellionLevel = clearsRebellion ? 0 : player.rebellionLevel;

    const nextPlayers = state.players.map((candidate) =>
      candidate.id === this.playerId
        ? {
            ...candidate,
            treasury: candidate.treasury - this.amount,
            citizenSatisfaction: newSatisfaction,
            rebellionLevel: nextRebellionLevel,
          }
        : candidate,
    );

    const events: readonly GameEngineEvent[] = [
      {
        type: 'CitizenSatisfactionChanged',
        playerId: this.playerId,
        citizenSatisfaction: newSatisfaction,
        rebellionLevel: nextRebellionLevel,
      },
    ];
    return { state: { ...state, players: nextPlayers }, events };
  }
}
