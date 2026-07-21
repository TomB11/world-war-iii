import { Faction } from '../../../models/faction.model';
import { UnitInstance } from '../../../models/unit-instance.model';
import { pathRoundedRect } from './canvas-shapes';
import {
  COUNT_BADGE_FONT_PX,
  COUNT_BADGE_RADIUS_PX,
  UNIT_ICON_ORDER,
  UNIT_ICON_PLATE_CORNER_RADIUS_PX,
  UNIT_ICON_PLATE_PADDING_X_PX,
  UNIT_ICON_PLATE_PADDING_Y_PX,
  UNIT_ICON_SIZE_PX,
  UNIT_ICON_SPACING_PX,
  UNIT_ICONS_PER_ROW,
} from './unit-icon-config';

/** Resolves a unit type + faction color to its tinted icon artwork; null while the source image is still loading. */
export type UnitIconLookup = (unitId: string, color: string) => HTMLCanvasElement | null;

export interface IconLayoutEntry {
  readonly unitId: string;
  readonly x: number;
  readonly y: number;
  readonly instanceIds: readonly string[];
}

/**
 * Pure layout math for a cluster of unit icons anchored at (anchorX, anchorY)
 * — shared by rendering and hit-testing so they can never drift apart.
 * `scale` is the map's current zoom (view.scale); icons keep a constant
 * on-screen size regardless of zoom, so their map-unit-space size shrinks
 * as scale grows.
 */
export function layoutUnitIcons(
  anchorX: number,
  anchorY: number,
  units: readonly UnitInstance[],
  scale: number,
): readonly IconLayoutEntry[] {
  const groups = new Map<string, UnitInstance[]>();
  for (const unit of units) {
    let group = groups.get(unit.unitId);
    if (!group) {
      group = [];
      groups.set(unit.unitId, group);
    }
    group.push(unit);
  }
  const orderedIds = [
    ...UNIT_ICON_ORDER.filter((id) => groups.has(id)),
    ...[...groups.keys()].filter((id) => !UNIT_ICON_ORDER.includes(id)),
  ];

  const spacing = UNIT_ICON_SPACING_PX / scale;
  const perRow = UNIT_ICONS_PER_ROW;

  return orderedIds.map((unitId, index) => {
    const group = groups.get(unitId);
    if (group === undefined) {
      throw new Error(`Unit icon group for "${unitId}" was not found`);
    }
    const row = Math.floor(index / perRow);
    const col = index % perRow;
    const colsInRow = Math.min(perRow, orderedIds.length - row * perRow);
    return {
      unitId,
      x: anchorX - ((colsInRow - 1) * spacing) / 2 + col * spacing,
      y: anchorY + row * spacing,
      instanceIds: group.map((u) => u.id),
    };
  });
}

/**
 * Draws one unit type's icon, tinted with the owning faction's color, fit
 * (aspect-preserved, centered) within a `size` x `size` cell. Falls back to
 * a plain colored dot while the source artwork is still loading — see
 * UnitIconImageCache (rendering/unit-icon-images.ts).
 */
export function drawUnitIcon(
  context: CanvasRenderingContext2D,
  unitId: string,
  cx: number,
  cy: number,
  size: number,
  color: string,
  scale: number,
  getUnitIcon: UnitIconLookup,
): void {
  const icon = getUnitIcon(unitId, color);
  if (!icon || icon.width === 0 || icon.height === 0) {
    context.save();
    context.beginPath();
    context.arc(cx, cy, size * 0.4, 0, Math.PI * 2);
    context.fillStyle = color;
    context.fill();
    context.lineWidth = 1 / scale;
    context.strokeStyle = '#0b0e14';
    context.stroke();
    context.restore();
    return;
  }

  const aspect = icon.width / icon.height;
  let drawWidth = size;
  let drawHeight = size / aspect;
  if (drawHeight > size) {
    drawHeight = size;
    drawWidth = size * aspect;
  }

  context.drawImage(icon, cx - drawWidth / 2, cy - drawHeight / 2, drawWidth, drawHeight);
}

/** Small numbered marker overlaid on a unit icon's corner when more than one of that type is stacked. */
export function drawCountBadge(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  count: number,
  scale: number,
): void {
  const radius = COUNT_BADGE_RADIUS_PX / scale;
  context.beginPath();
  context.arc(x, y, radius, 0, Math.PI * 2);
  context.fillStyle = '#c0392b';
  context.fill();
  context.lineWidth = 1.2 / scale;
  context.strokeStyle = '#ffffff';
  context.stroke();

  context.fillStyle = '#ffffff';
  context.font = `bold ${COUNT_BADGE_FONT_PX / scale}px Segoe UI, Roboto, sans-serif`;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(String(count), x, y + 0.5 / scale);
}

/**
 * Unit silhouettes for the units at one map location (land region or sea
 * zone): one icon per unit type present, filled with the owning faction's
 * color, with a small count badge on any icon representing more than one
 * unit, all sitting on a solid backing plate so it reads clearly against
 * any map terrain/ocean color underneath. If the cluster contains a unit
 * the active player can act with this movement phase (movableUnitIds), the
 * plate gets a bright accent outline so the player can see at a glance
 * which units are movable (PROJECT_RULES.md sections 7/17).
 */
export function drawUnitCluster(
  context: CanvasRenderingContext2D,
  anchorX: number,
  anchorY: number,
  units: readonly UnitInstance[],
  factions: Readonly<Record<string, Faction>>,
  scale: number,
  getUnitIcon: UnitIconLookup,
  movableUnitIds: ReadonlySet<string>,
): void {
  const layout = layoutUnitIcons(anchorX, anchorY, units, scale);
  if (layout.length === 0) {
    return;
  }

  const iconSize = UNIT_ICON_SIZE_PX / scale;
  const spacing = UNIT_ICON_SPACING_PX / scale;
  const perRow = UNIT_ICONS_PER_ROW;
  const rowCount = Math.ceil(layout.length / perRow);
  const colsInFirstRow = Math.min(perRow, layout.length);

  const platePaddingX = UNIT_ICON_PLATE_PADDING_X_PX / scale;
  const platePaddingY = UNIT_ICON_PLATE_PADDING_Y_PX / scale;
  const plateWidth = colsInFirstRow * spacing + platePaddingX * 2;
  const plateHeight = rowCount * spacing + platePaddingY * 2;
  const plateLeft = anchorX - plateWidth / 2;
  const plateTop = anchorY - iconSize / 2 - platePaddingY;
  const hasMovable = units.some((u) => movableUnitIds.has(u.id));

  pathRoundedRect(context, plateLeft, plateTop, plateWidth, plateHeight, UNIT_ICON_PLATE_CORNER_RADIUS_PX / scale);
  context.fillStyle = 'rgba(11, 14, 20, 0.72)';
  context.fill();
  context.lineWidth = (hasMovable ? 2 : 1) / scale;
  context.strokeStyle = hasMovable ? '#e0ac4d' : 'rgba(230, 233, 240, 0.5)';
  context.stroke();

  for (const entry of layout) {
    const group = units.filter((u) => entry.instanceIds.includes(u.id));
    const ownerId = group[0]?.ownerId;
    const color = (ownerId && factions[ownerId]?.color) || '#888888';
    drawUnitIcon(context, entry.unitId, entry.x, entry.y, iconSize, color, scale, getUnitIcon);

    if (group.length > 1) {
      drawCountBadge(context, entry.x + iconSize * 0.6, entry.y + iconSize * 0.6, group.length, scale);
    }
  }
}
