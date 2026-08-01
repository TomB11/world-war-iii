/**
 * Presentation-only color per Citizen Satisfaction zone (PROJECT_RULES.md
 * section 5, data/economy.json citizenSatisfactionZones). The zone
 * boundaries/order themselves are data-driven; only this color mapping is
 * a UI choice.
 */
export const ZONE_COLORS: Readonly<Record<string, string>> = {
  rebellion: '#7a1f1f',
  neutral: '#20242c',
  incomeBonusLow: '#c9a227',
  incomeBonusHigh: '#e0ac4d',
  victoryPointsLow: '#5c6470',
  victoryPointsHigh: '#8891a0',
};
