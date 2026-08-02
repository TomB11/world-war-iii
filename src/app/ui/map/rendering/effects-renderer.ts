import { Region } from '../../../models/region.model';
import { SeaZone } from '../../../models/sea-zone.model';

/** What kind of burst this is — same queue/lifecycle machinery, different palette and shape. */
export type MapEffectKind = 'explosion' | 'glitch' | 'spawn';

/** One drifting smoke puff following an explosion — its shape/timing is fixed at spawn (createMapEffect) so it doesn't jitter or re-randomize between frames. Unused for 'glitch'/'spawn' kinds. */
interface SmokePuff {
  readonly offsetXPx: number;
  readonly driftXPx: number;
  readonly scale: number;
  readonly delayMs: number;
}

/** A single attack/casualty/cyber/deploy moment, anchored to a region or sea zone id, live on the map until its kind's own duration elapses. */
export interface ActiveMapEffect {
  readonly id: number;
  readonly regionId: string;
  readonly kind: MapEffectKind;
  readonly startedAt: number;
  readonly puffs: readonly SmokePuff[];
}

const EXPLOSION_DURATION_MS = 320;
const PUFF_COUNT = 4;
const SMOKE_START_DELAY_MS = 140;
const SMOKE_STAGGER_MS = 90;
const SMOKE_PUFF_DURATION_MS = 700;
/** Total lifetime of an 'explosion' effect (flash + its last smoke puff finishing). */
const EXPLOSION_TOTAL_DURATION_MS = SMOKE_START_DELAY_MS + PUFF_COUNT * SMOKE_STAGGER_MS + SMOKE_PUFF_DURATION_MS;

const GLITCH_DURATION_MS = 480;
const SPAWN_DURATION_MS = 520;

/** How long a given effect kind stays alive — callers (WorldMapComponent) use this to know when to drop it from the active list. */
export function mapEffectDurationMs(kind: MapEffectKind): number {
  switch (kind) {
    case 'explosion':
      return EXPLOSION_TOTAL_DURATION_MS;
    case 'glitch':
      return GLITCH_DURATION_MS;
    case 'spawn':
      return SPAWN_DURATION_MS;
  }
}

/** Spawns a new effect with randomized-but-fixed smoke puff shapes (only meaningful for 'explosion') — cosmetic only, so plain Math.random() is fine (no game-state determinism concern here). */
export function createMapEffect(id: number, regionId: string, kind: MapEffectKind, startedAt: number): ActiveMapEffect {
  if (kind !== 'explosion') {
    return { id, regionId, kind, startedAt, puffs: [] };
  }
  const puffs: SmokePuff[] = [];
  for (let i = 0; i < PUFF_COUNT; i += 1) {
    puffs.push({
      offsetXPx: (Math.random() - 0.5) * 16,
      driftXPx: (Math.random() - 0.5) * 20,
      scale: 0.7 + Math.random() * 0.6,
      delayMs: SMOKE_START_DELAY_MS + i * SMOKE_STAGGER_MS + Math.random() * 40,
    });
  }
  return { id, regionId, kind, startedAt, puffs };
}

/** Paints every still-live effect at its region/sea-zone's map position. Draw this last, on top of everything else. */
export function drawMapEffects(
  context: CanvasRenderingContext2D,
  effects: readonly ActiveMapEffect[],
  regionsById: Readonly<Record<string, Region>>,
  seaZonesById: Readonly<Record<string, SeaZone>>,
  mapWidth: number,
  mapHeight: number,
  scale: number,
  now: number,
): void {
  for (const effect of effects) {
    const position = regionsById[effect.regionId]?.position ?? seaZonesById[effect.regionId]?.position;
    if (!position) {
      continue;
    }
    const elapsed = now - effect.startedAt;
    if (elapsed < 0 || elapsed > mapEffectDurationMs(effect.kind)) {
      continue;
    }
    const cx = position.x * mapWidth;
    const cy = position.y * mapHeight;
    switch (effect.kind) {
      case 'explosion':
        drawExplosionFlash(context, cx, cy, elapsed, scale);
        drawSmokePuffs(context, cx, cy, effect.puffs, elapsed, scale);
        break;
      case 'glitch':
        drawGlitch(context, cx, cy, elapsed, scale);
        break;
      case 'spawn':
        drawSpawnRing(context, cx, cy, elapsed, scale);
        break;
    }
  }
}

function drawExplosionFlash(context: CanvasRenderingContext2D, cx: number, cy: number, elapsed: number, scale: number): void {
  if (elapsed > EXPLOSION_DURATION_MS) {
    return;
  }
  const t = elapsed / EXPLOSION_DURATION_MS;
  const maxRadius = 42 / scale;
  const radius = maxRadius * (0.35 + 0.65 * t);
  const alpha = 1 - t;

  context.save();
  const gradient = context.createRadialGradient(cx, cy, 0, cx, cy, radius);
  gradient.addColorStop(0, `rgba(255, 250, 224, ${alpha})`);
  gradient.addColorStop(0.3, `rgba(255, 176, 59, ${0.95 * alpha})`);
  gradient.addColorStop(0.65, `rgba(216, 68, 33, ${0.75 * alpha})`);
  gradient.addColorStop(1, 'rgba(216, 68, 33, 0)');
  context.fillStyle = gradient;
  context.beginPath();
  context.arc(cx, cy, radius, 0, Math.PI * 2);
  context.fill();

  const sparkCount = 8;
  context.strokeStyle = `rgba(255, 214, 140, ${0.9 * alpha})`;
  context.lineWidth = 2.5 / scale;
  for (let i = 0; i < sparkCount; i += 1) {
    const angle = (Math.PI * 2 * i) / sparkCount + 0.3;
    const innerRadius = radius * 0.5;
    const outerRadius = radius * (1.4 + 0.5 * t);
    context.beginPath();
    context.moveTo(cx + Math.cos(angle) * innerRadius, cy + Math.sin(angle) * innerRadius);
    context.lineTo(cx + Math.cos(angle) * outerRadius, cy + Math.sin(angle) * outerRadius);
    context.stroke();
  }
  context.restore();
}

function drawSmokePuffs(
  context: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  puffs: readonly SmokePuff[],
  elapsed: number,
  scale: number,
): void {
  for (const puff of puffs) {
    const localElapsed = elapsed - puff.delayMs;
    if (localElapsed < 0 || localElapsed > SMOKE_PUFF_DURATION_MS) {
      continue;
    }
    const t = localElapsed / SMOKE_PUFF_DURATION_MS;
    const radius = ((18 + 10 * t) * puff.scale) / scale;
    const riseDistance = (38 * puff.scale) / scale;
    const x = cx + (puff.offsetXPx + puff.driftXPx * t) / scale;
    const y = cy - riseDistance * t;
    const alpha = (1 - t) * 0.62;

    context.save();
    context.fillStyle = `rgba(60, 62, 68, ${alpha})`;
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.fill();
    context.restore();
  }
}

/** Cyber attack/sabotage/political influence: a flickering scan-line box over the target — deliberately noisy (fresh Math.random() every frame) since real static doesn't repeat identically frame to frame. */
function drawGlitch(context: CanvasRenderingContext2D, cx: number, cy: number, elapsed: number, scale: number): void {
  const t = elapsed / GLITCH_DURATION_MS;
  const alpha = 1 - t;
  const boxSize = 30 / scale;
  const half = boxSize / 2;

  context.save();
  const lineCount = 5;
  for (let i = 0; i < lineCount; i += 1) {
    if (Math.random() < 0.35) {
      continue;
    }
    const ly = cy - half + (boxSize * (i + 0.5)) / lineCount;
    const jitter = (Math.random() - 0.5) * 6 * alpha;
    context.fillStyle = i % 2 === 0 ? `rgba(79, 184, 224, ${0.6 * alpha})` : `rgba(216, 68, 33, ${0.5 * alpha})`;
    context.fillRect(cx - half + jitter, ly - 1 / scale, boxSize, 2 / scale);
  }
  context.strokeStyle = `rgba(79, 184, 224, ${0.85 * alpha})`;
  context.lineWidth = 1.5 / scale;
  context.strokeRect(cx - half, cy - half, boxSize, boxSize);
  context.restore();
}

/** Unit deploy: an expanding friendly-green ring with a few particles drifting up as the new unit "materializes". */
function drawSpawnRing(context: CanvasRenderingContext2D, cx: number, cy: number, elapsed: number, scale: number): void {
  const t = elapsed / SPAWN_DURATION_MS;
  const alpha = 1 - t;
  const radius = (7 + 27 * t) / scale;

  context.save();
  context.strokeStyle = `rgba(92, 184, 92, ${0.85 * alpha})`;
  context.lineWidth = 2 / scale;
  context.beginPath();
  context.arc(cx, cy, radius, 0, Math.PI * 2);
  context.stroke();

  const particleCount = 5;
  context.fillStyle = `rgba(160, 230, 160, ${alpha})`;
  for (let i = 0; i < particleCount; i += 1) {
    const angle = (Math.PI * 2 * i) / particleCount;
    const dist = radius * 0.65;
    const px = cx + Math.cos(angle) * dist;
    const py = cy + Math.sin(angle) * dist - (12 * t) / scale;
    context.beginPath();
    context.arc(px, py, 1.8 / scale, 0, Math.PI * 2);
    context.fill();
  }
  context.restore();
}
