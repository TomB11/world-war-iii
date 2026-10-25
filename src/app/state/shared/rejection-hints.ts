import { REJECTION_HINT_RULES } from './rejection-hints.constants';

/** A short "how to avoid this" suggestion for an engine rejection reason, or null when none applies. */
export function getRejectionHint(reason: string): string | null {
  return REJECTION_HINT_RULES.find((rule) => rule.pattern.test(reason))?.hint ?? null;
}
