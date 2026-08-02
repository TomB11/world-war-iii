import { rollDie } from '../../random';
import { DICE_SIDES } from '../../constants/dice.constants';

export interface HackResolution {
  readonly attackRoll: number;
  readonly succeeded: boolean;
  readonly moneyStolen: number;
  readonly nextSeed: number;
}

/**
 * Shared hack roll/resolve math (PROJECT_RULES.md section 6): roll a d6
 * against the target's Hack Level — on success (roll <= their Hack Level),
 * the target rolls a d6 too, and that much money transfers (clamped to what
 * they actually have). Shared by HackCommand (the normal, cost-charging
 * Cyber Attack action a human/AI spends their turn's slot on) and
 * AiFreeCyberAttackCommand (Solo Command Mode's Threat Track / Nightmare
 * difficulty bonus, which skips the cost and the once-per-turn slot).
 */
export function resolveHack(seed: number, targetHackLevel: number, targetTreasury: number): HackResolution {
  const attackRoll = rollDie(seed, DICE_SIDES);
  const succeeded = attackRoll.result <= targetHackLevel;

  let moneyStolen = 0;
  let nextSeed = attackRoll.nextSeed;
  if (succeeded) {
    const defenseRoll = rollDie(nextSeed, DICE_SIDES);
    nextSeed = defenseRoll.nextSeed;
    moneyStolen = Math.min(defenseRoll.result, targetTreasury);
  }

  return { attackRoll: attackRoll.result, succeeded, moneyStolen, nextSeed };
}
