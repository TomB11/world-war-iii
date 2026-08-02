import { chooseCasualtyUnit } from './ai-casualty-choice.util';
import { unitDef, unitInstance } from '../test-fixtures';
import { UnitDefinition } from '../../models/unit.model';

describe('chooseCasualtyUnit', () => {
  const catalog: Readonly<Record<string, UnitDefinition>> = {
    infantry: unitDef({ id: 'infantry', cost: 5 }),
    tank: unitDef({ id: 'tank', cost: 8 }),
  };

  it('picks the cheapest unit among the candidates', () => {
    const candidates = [
      unitInstance({ id: 'u-tank', unitId: 'tank', ownerId: 'p1', regionId: 'front' }),
      unitInstance({ id: 'u-infantry', unitId: 'infantry', ownerId: 'p1', regionId: 'front' }),
    ];
    expect(chooseCasualtyUnit(candidates, catalog)).toBe('u-infantry');
  });

  it('returns the sole candidate when there is only one', () => {
    const candidates = [unitInstance({ id: 'only', unitId: 'tank', ownerId: 'p1', regionId: 'front' })];
    expect(chooseCasualtyUnit(candidates, catalog)).toBe('only');
  });
});
