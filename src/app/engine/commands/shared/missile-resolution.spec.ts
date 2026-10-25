import { resolveMissileStrike } from './missile-resolution';

describe('resolveMissileStrike', () => {
  const seeds = Array.from({ length: 200 }, (_, index) => index + 1);

  it('never rolls interception when the attacker misses', () => {
    for (const seed of seeds) {
      const result = resolveMissileStrike(seed, 2, true);
      if (result.outcome === 'miss') {
        expect(result.interceptRoll).toBeNull();
        expect(result.attackRoll).toBeGreaterThan(2);
      }
    }
  });

  it('only rolls interception after a hit, and a successful interception cancels it', () => {
    let sawIntercepted = false;
    let sawHit = false;
    for (const seed of seeds) {
      const result = resolveMissileStrike(seed, 4, true);
      expect(result.attackRoll).not.toBeNull();
      if (result.interceptRoll !== null) {
        expect(result.attackRoll).toBeLessThanOrEqual(4);
        if (result.interceptRoll <= 2) {
          expect(result.outcome).toBe('intercepted');
          sawIntercepted = true;
        } else {
          expect(result.outcome).toBe('hit');
          sawHit = true;
        }
      }
    }
    expect(sawIntercepted).toBeTrue();
    expect(sawHit).toBeTrue();
  });

  it('skips interception entirely when no defending Rocket System is in range', () => {
    for (const seed of seeds) {
      const result = resolveMissileStrike(seed, 4, false);
      expect(result.interceptRoll).toBeNull();
      expect(['hit', 'miss']).toContain(result.outcome);
    }
  });
});
