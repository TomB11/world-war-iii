/**
 * All sizing/spacing for the unit icons drawn on the map. This is the one
 * file to edit to make unit icons bigger/smaller/further apart — nothing
 * else in ui/map hardcodes these numbers.
 */
export const UNIT_ICON_SIZE_PX = 18;
export const UNIT_ICON_SPACING_PX = 23;
export const UNIT_ICONS_PER_ROW = 3;

/** Extra padding around the icon cluster's backing plate. */
export const UNIT_ICON_PLATE_PADDING_X_PX = 5;
export const UNIT_ICON_PLATE_PADDING_Y_PX = 4;
export const UNIT_ICON_PLATE_CORNER_RADIUS_PX = 4;

/** The small red "×N" marker drawn on an icon when more than one unit of that type is stacked. */
export const COUNT_BADGE_RADIUS_PX = 6;
export const COUNT_BADGE_FONT_PX = 8;

/** The icon that follows the cursor while dragging a unit. */
export const DRAG_GHOST_ICON_SIZE_PX = 22;

/**
 * Draw order for unit silhouettes so a mixed stack always renders the same
 * way, regardless of the order units were deployed/purchased in.
 */
export const UNIT_ICON_ORDER: readonly string[] = [
  'infantry',
  'tank',
  'helicopter',
  'submarine',
  'stealth-boat',
  'destroyer',
  'fighter',
  'rocket-system',
  'land-transport',
  'aircraft-carrier',
  'missile-a',
  'missile-b',
];
