/**
 * Deterministic-friendly id helpers. The engine must remain reproducible,
 * so we never rely on time-based or crypto-random ids for gameplay entities;
 * this is a plain incrementing counter for ephemeral, non-persisted UI needs.
 */
export function createSequentialIdFactory(prefix: string): () => string {
  let counter = 0;
  return (): string => {
    counter += 1;
    return `${prefix}-${counter}`;
  };
}
