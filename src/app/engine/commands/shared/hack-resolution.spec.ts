import { resolveHack } from './hack-resolution';

describe('resolveHack', () => {
  it('never steals a negative amount from a target with a negative treasury', () => {
    for (let seed = 1; seed <= 200; seed += 1) {
      const resolution = resolveHack(seed, 6, -5);
      expect(resolution.moneyStolen).toBeGreaterThanOrEqual(0);
    }
  });

  it('caps the stolen amount at what the target actually has', () => {
    for (let seed = 1; seed <= 200; seed += 1) {
      expect(resolveHack(seed, 6, 2).moneyStolen).toBeLessThanOrEqual(2);
    }
  });
});
