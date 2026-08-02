import { ReserveEntry } from '../../../models/unit.model';

/** Adds `quantity` of `unitId` to a player's Reserve, merging into an existing entry rather than creating a duplicate line. Shared by PurchaseUnitCommand and GrantFreeUnitsCommand (Solo Command Mode). */
export function mergeReserve(
  reserve: readonly ReserveEntry[],
  unitId: string,
  quantity: number,
): readonly ReserveEntry[] {
  const existing = reserve.find((entry) => entry.unitId === unitId);
  if (!existing) {
    return [...reserve, { unitId, quantity }];
  }
  return reserve.map((entry) => (entry.unitId === unitId ? { ...entry, quantity: entry.quantity + quantity } : entry));
}
