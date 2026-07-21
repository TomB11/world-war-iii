import { Injectable } from '@angular/core';

/**
 * A small, fully deterministic PRNG (mulberry32). GameState stores the seed
 * so replays/saves are reproducible (PROJECT_RULES.md section 29 requires
 * the random seed to be part of the save). This service is an Angular-side
 * convenience wrapper; combat/dice systems (Phase 6) will use the same
 * algorithm seeded from GameState.randomSeed.
 */
@Injectable({ providedIn: 'root' })
export class RandomService {
  private state = 1;

  seed(value: number): void {
    this.state = value >>> 0;
  }

  /** Returns a float in [0, 1). */
  next(): number {
    this.state |= 0;
    this.state = (this.state + 0x6d2b79f5) | 0;
    let t = Math.imul(this.state ^ (this.state >>> 15), 1 | this.state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Returns an integer in [1, sides] — used by the future dice system. */
  rollDie(sides: number): number {
    return Math.floor(this.next() * sides) + 1;
  }
}
