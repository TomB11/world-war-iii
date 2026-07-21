import { PlayerState } from '../../../models/player.model';
import { EconomyConfig } from '../../../models/economy-config.model';
import { clamp } from '../../../core/utils/math.util';

/**
 * By-force capture Citizen Satisfaction penalties (PROJECT_RULES.md section
 * 5): the attacker takes a hit for capturing at all, and the previous owner
 * (if any — the region may have been neutral) takes a separate hit for
 * losing it. Shared by every command that can flip region ownership via
 * combat (AttackCommand, RemoveCasualtyCommand, UnloadUnitCommand).
 */
export function applyForceCaptureSatisfactionPenalty(
  players: readonly PlayerState[],
  attackerId: string,
  previousOwnerId: string | null,
  economyConfig: EconomyConfig,
): PlayerState[] {
  const min = economyConfig.citizenSatisfactionMin;
  const max = economyConfig.citizenSatisfactionMax;
  return players.map((candidate) => {
    if (candidate.id === attackerId) {
      return {
        ...candidate,
        citizenSatisfaction: clamp(
          candidate.citizenSatisfaction - economyConfig.captureSatisfactionPenaltyAttacker,
          min,
          max,
        ),
      };
    }
    if (previousOwnerId !== null && candidate.id === previousOwnerId) {
      return {
        ...candidate,
        citizenSatisfaction: clamp(
          candidate.citizenSatisfaction - economyConfig.captureSatisfactionPenaltyDefender,
          min,
          max,
        ),
      };
    }
    return candidate;
  });
}
