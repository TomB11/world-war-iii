/**
 * Pure, deterministic dice rolling for the engine — same mulberry32
 * algorithm as services/random.service.ts, but engine code may not depend
 * on Angular services (CODING_STANDARDS.md section 5), so commands roll by
 * threading GameState.randomSeed through this function and writing back
 * the returned nextSeed, keeping the whole game replayable from its seed
 * (PROJECT_RULES.md section 29).
 */
export interface DiceRoll {
  readonly result: number;
  readonly nextSeed: number;
}

/** Rolls one die with the given number of sides, returning [1, sides] and the advanced seed. */
export function rollDie(seed: number, sides: number): DiceRoll {
  let state = seed | 0;
  state = (state + 0x6d2b79f5) | 0;
  let t = Math.imul(state ^ (state >>> 15), 1 | state);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  const result = Math.floor(value * sides) + 1;
  return { result, nextSeed: state >>> 0 };
}
