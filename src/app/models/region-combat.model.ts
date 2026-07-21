/**
 * Tracks an in-progress dice battle for one contested region, resolved
 * during the Attack Phase (PROJECT_RULES.md sections 9-14). Created lazily
 * on the first roll and removed once the fight ends (region captured or
 * attack repelled) — a region absent from GameState.combats simply hasn't
 * had its first die rolled yet.
 *
 * If the attacker declared a missile strike (a Rocket System present —
 * PROJECT_RULES.md section 15), the battle opens with a missile sub-phase
 * ('missileChoice' -> optionally 'missileCasualty') before any of that —
 * missiles always resolve first.
 *
 * Each round is a simultaneous exchange (PROJECT_RULES.md section 10):
 * attacker rolls, then defender rolls (with its full pre-casualty roster —
 * a unit due to die this round still gets its own roll first), and only
 * then are both sides' casualties assigned and removed.
 */
export type CombatStep =
  | 'missileChoice'
  | 'missileCasualty'
  | 'attackerRoll'
  | 'defenderRoll'
  | 'defenderCasualty'
  | 'attackerCasualty';

/** A unit removed as a casualty this battle — kept around (instead of just vanishing) so the combat board can still show it in its column's casualty slot. */
export interface CombatCasualty {
  readonly instanceId: string;
  readonly unitId: string;
}

/** One unit's die roll this round, kept per-unit so the combat board can show exactly which unit rolled what (and whether it hit) next to its own icon. */
export interface CombatDieRoll {
  readonly instanceId: string;
  readonly unitId: string;
  readonly roll: number;
  readonly hit: boolean;
}

export type MissileOutcome = 'intercepted' | 'hit' | 'miss';

/** The outcome of a fired missile — set once per battle and kept for display, since the missile sub-phase never repeats (PROJECT_RULES.md section 15). */
export interface MissileResult {
  readonly missileId: string;
  /** Defender's interception roll, or null if no defending Rocket System was in range to attempt one. */
  readonly interceptRoll: number | null;
  /** Attacker's hit roll, or null if the missile was intercepted before it got the chance. */
  readonly attackRoll: number | null;
  readonly outcome: MissileOutcome;
}

export interface RegionCombat {
  readonly regionId: string;
  readonly round: number;
  readonly step: CombatStep;
  /** Hits the attacker scored this round — the defender must remove this many of their own units. */
  readonly pendingDefenderCasualties: number;
  /** Hits the defender scored this round — the attacker must remove this many of their own units. */
  readonly pendingAttackerCasualties: number;
  readonly lastAttackerRolls: readonly CombatDieRoll[];
  readonly lastDefenderRolls: readonly CombatDieRoll[];
  readonly attackerCasualties: readonly CombatCasualty[];
  readonly defenderCasualties: readonly CombatCasualty[];
  /** Null until a missile is fired (or the missile phase is skipped) this battle. */
  readonly missileResult: MissileResult | null;
}
