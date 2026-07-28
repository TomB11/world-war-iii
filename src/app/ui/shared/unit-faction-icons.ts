/** Unit id whose icon gets a small "A" badge (PROJECT_RULES.md section 20) — no dedicated artwork of its own yet, so it reuses Infantry's. */
export const AIRBORNE_INFANTRY_UNIT_ID = 'infantry-airborne';

const INFANTRY_ICON_PATHS: Readonly<Record<string, string>> = {
  euto: 'assets/units/infantry-euto.png',
  usa: 'assets/units/infantry-usa.png',
  russia: 'assets/units/infantry-russia.png',
  china: 'assets/units/infantry-china.png',
  seato: 'assets/units/infantry-seato.png',
  'arabia-league': 'assets/units/infantry-arabia-league.png',
};

/**
 * Dedicated, already-faction-colored artwork for a (unitId, factionId) pair
 * — used as-is in place of the generic silhouette+tint pipeline, in both the
 * canvas map renderer (ui/map/rendering/unit-icon-images.ts) and the DOM
 * unit icon component (ui/shared/unit-icon). Any unit not listed here (or a
 * faction/owner not listed under it, e.g. neutral/rebel garrisons) falls
 * back to the shared silhouette tinted with that faction's color.
 */
const UNIT_FACTION_ICON_PATHS: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  infantry: INFANTRY_ICON_PATHS,
  [AIRBORNE_INFANTRY_UNIT_ID]: INFANTRY_ICON_PATHS,
  tank: {
    euto: 'assets/units/tank-euto.png',
    usa: 'assets/units/tank-usa.png',
    russia: 'assets/units/tank-russia.png',
    china: 'assets/units/tank-china.png',
    seato: 'assets/units/tank-seato.png',
    'arabia-league': 'assets/units/tank-arabia-league.png',
  },
  helicopter: {
    euto: 'assets/units/helicopter-euto.png',
    usa: 'assets/units/helicopter-usa.png',
    russia: 'assets/units/helicopter-russia.png',
    china: 'assets/units/helicopter-china.png',
    seato: 'assets/units/helicopter-seato.png',
    'arabia-league': 'assets/units/helicopter-arabia-league.png',
  },
  fighter: {
    euto: 'assets/units/fighter-euto.png',
    usa: 'assets/units/fighter-usa.png',
    russia: 'assets/units/fighter-russia.png',
    china: 'assets/units/fighter-china.png',
    seato: 'assets/units/fighter-seato.png',
    'arabia-league': 'assets/units/fighter-arabia-league.png',
  },
  'rocket-system': {
    euto: 'assets/units/rocket-system-euto.png',
    usa: 'assets/units/rocket-system-usa.png',
    russia: 'assets/units/rocket-system-russia.png',
    china: 'assets/units/rocket-system-china.png',
    seato: 'assets/units/rocket-system-seato.png',
    'arabia-league': 'assets/units/rocket-system-arabia-league.png',
  },
  submarine: {
    euto: 'assets/units/submarine-euto.png',
    usa: 'assets/units/submarine-usa.png',
    russia: 'assets/units/submarine-russia.png',
    china: 'assets/units/submarine-china.png',
    seato: 'assets/units/submarine-seato.png',
    'arabia-league': 'assets/units/submarine-arabia-league.png',
  },
  'stealth-boat': {
    euto: 'assets/units/stealth-boat-euto.png',
    usa: 'assets/units/stealth-boat-usa.png',
    russia: 'assets/units/stealth-boat-russia.png',
    china: 'assets/units/stealth-boat-china.png',
    seato: 'assets/units/stealth-boat-seato.png',
    'arabia-league': 'assets/units/stealth-boat-arabia-league.png',
  },
  destroyer: {
    euto: 'assets/units/destroyer-euto.png',
    usa: 'assets/units/destroyer-usa.png',
    russia: 'assets/units/destroyer-russia.png',
    china: 'assets/units/destroyer-china.png',
    seato: 'assets/units/destroyer-seato.png',
    'arabia-league': 'assets/units/destroyer-arabia-league.png',
  },
  'aircraft-carrier': {
    euto: 'assets/units/aircraft-carrier-euto.png',
    usa: 'assets/units/aircraft-carrier-usa.png',
    russia: 'assets/units/aircraft-carrier-russia.png',
    china: 'assets/units/aircraft-carrier-china.png',
    seato: 'assets/units/aircraft-carrier-seato.png',
    'arabia-league': 'assets/units/aircraft-carrier-arabia-league.png',
  },
  'land-transport': {
    euto: 'assets/units/land-transport-euto.png',
    usa: 'assets/units/land-transport-usa.png',
    russia: 'assets/units/land-transport-russia.png',
    china: 'assets/units/land-transport-china.png',
    seato: 'assets/units/land-transport-seato.png',
    'arabia-league': 'assets/units/land-transport-arabia-league.png',
  },
};

/**
 * Dedicated artwork for a unit that looks the same regardless of owning
 * faction (e.g. a missile has no faction insignia of its own) — checked
 * after the per-faction catalog above finds no match.
 */
const UNIT_DEFAULT_ICON_PATHS: Readonly<Record<string, string>> = {
  'missile-a': 'assets/units/missile-a-art.png',
  'missile-b': 'assets/units/missile-b-art.png',
};

/** The dedicated artwork path for this unit (+ faction, if it has faction-specific art), or undefined if none exists (caller should fall back to silhouette+tint). */
export function getFactionIconPath(unitId: string, ownerId: string | null): string | undefined {
  const perFaction = ownerId !== null ? UNIT_FACTION_ICON_PATHS[unitId]?.[ownerId] : undefined;
  return perFaction ?? UNIT_DEFAULT_ICON_PATHS[unitId];
}
