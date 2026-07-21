import { Faction } from '../../../models/faction.model';
import { Region } from '../../../models/region.model';

const TOKEN_DOT_RADIUS_PX = 5;
const TOKEN_DOT_SPACING_PX = 12;
const TOKEN_FONT_PX = 7;

/**
 * Draws one small colored, numbered dot per faction with a Political
 * Influence token on this region (PROJECT_RULES.md section 6) — stacked in
 * a column just to the right of the flag box, so a token placement is
 * visible on the map itself without needing to select the region.
 */
export function drawInfluenceTokens(
  context: CanvasRenderingContext2D,
  region: Region,
  rightEdgeX: number,
  centerY: number,
  factions: Readonly<Record<string, Faction>>,
  scale: number,
): void {
  const tokens = region.influenceTokens;
  if (!tokens) {
    return;
  }
  const entries = Object.entries(tokens).filter(([, count]) => count > 0);
  if (entries.length === 0) {
    return;
  }

  const radius = TOKEN_DOT_RADIUS_PX / scale;
  const spacing = TOKEN_DOT_SPACING_PX / scale;
  const x = rightEdgeX + radius + 3 / scale;
  const totalHeight = (entries.length - 1) * spacing;
  const startY = centerY - totalHeight / 2;

  entries.forEach(([factionId, count], index) => {
    const y = startY + index * spacing;
    const color = factions[factionId]?.color ?? '#888888';

    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.fillStyle = color;
    context.fill();
    context.lineWidth = 1 / scale;
    context.strokeStyle = '#0b0e14';
    context.stroke();

    context.fillStyle = '#ffffff';
    context.font = `bold ${TOKEN_FONT_PX / scale}px Segoe UI, Roboto, sans-serif`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(String(count), x, y + 0.5 / scale);
  });
}
