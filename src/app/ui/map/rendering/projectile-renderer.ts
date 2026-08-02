import { Region } from '../../../models/region.model';
import { SeaZone } from '../../../models/sea-zone.model';

/** A missile fired via FireMissileCommand — flies from its launcher's region to the battle's region over PROJECTILE_DURATION_MS, timed to land right as the shared explosion+smoke effect (ui/map/rendering/effects-renderer.ts) starts at the target. */
export interface ActiveProjectile {
  readonly id: number;
  readonly launcherRegionId: string;
  readonly targetRegionId: string;
  readonly startedAt: number;
}

export const PROJECTILE_DURATION_MS = 380;

/** Paints every still-in-flight missile as a short glowing streak arcing from launcher to target. */
export function drawProjectiles(
  context: CanvasRenderingContext2D,
  projectiles: readonly ActiveProjectile[],
  regionsById: Readonly<Record<string, Region>>,
  seaZonesById: Readonly<Record<string, SeaZone>>,
  mapWidth: number,
  mapHeight: number,
  scale: number,
  now: number,
): void {
  for (const projectile of projectiles) {
    const from = regionsById[projectile.launcherRegionId]?.position ?? seaZonesById[projectile.launcherRegionId]?.position;
    const to = regionsById[projectile.targetRegionId]?.position ?? seaZonesById[projectile.targetRegionId]?.position;
    if (!from || !to) {
      continue;
    }
    const elapsed = now - projectile.startedAt;
    if (elapsed < 0 || elapsed > PROJECTILE_DURATION_MS) {
      continue;
    }
    const t = elapsed / PROJECTILE_DURATION_MS;
    const fromX = from.x * mapWidth;
    const fromY = from.y * mapHeight;
    const toX = to.x * mapWidth;
    const toY = to.y * mapHeight;
    // A slight upward arc (a lofted trajectory) rather than a flat straight line — peaks at the midpoint.
    const arcLift = -26 / scale;
    const positionAt = (progress: number): { x: number; y: number } => ({
      x: fromX + (toX - fromX) * progress,
      y: fromY + (toY - fromY) * progress + arcLift * 4 * progress * (1 - progress),
    });

    const head = positionAt(t);
    const tail = positionAt(Math.max(0, t - 0.18));

    context.save();
    context.strokeStyle = 'rgba(255, 176, 59, 0.85)';
    context.lineWidth = 2.5 / scale;
    context.lineCap = 'round';
    context.beginPath();
    context.moveTo(tail.x, tail.y);
    context.lineTo(head.x, head.y);
    context.stroke();

    context.fillStyle = '#fff4d6';
    context.beginPath();
    context.arc(head.x, head.y, 3 / scale, 0, Math.PI * 2);
    context.fill();
    context.restore();
  }
}
