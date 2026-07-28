import { getFactionIconPath } from '../../shared/unit-faction-icons';

const UNIT_ICON_IMAGE_PATHS: Readonly<Record<string, string>> = {
  infantry: 'assets/units/infantry.png',
  tank: 'assets/units/tank.png',
  helicopter: 'assets/units/helicopter.png',
  submarine: 'assets/units/submarine.png',
  'stealth-boat': 'assets/units/stealth-boat.png',
  destroyer: 'assets/units/destroyer.png',
  fighter: 'assets/units/fighter.png',
  'rocket-system': 'assets/units/rocket-system.png',
  'land-transport': 'assets/units/land-transport.png',
  'aircraft-carrier': 'assets/units/aircraft-carrier.png',
  'missile-a': 'assets/units/missile-a.png',
  'missile-b': 'assets/units/missile-b.png',
};

/**
 * Loads unit artwork once per source path and produces render-ready canvas
 * variants on demand, cached by unit+faction (or unit+color for the tinted
 * fallback). Two kinds of source art:
 * - Silhouette (assets/units/*.png — solid shape, transparent background):
 *   tinted with a solid fill through the source's alpha channel
 *   ('source-in'), so whatever RGB is baked into the source is discarded —
 *   only its shape matters.
 * - Dedicated per-faction art (see ui/shared/unit-faction-icons.ts): already
 *   fully colored, used as-is (just copied onto a cache canvas so callers
 *   get a uniform HTMLCanvasElement regardless of which path was taken).
 */
export class UnitIconImageCache {
  private readonly baseImages = new Map<string, HTMLImageElement>();
  private readonly rendered = new Map<string, HTMLCanvasElement>();

  /** Called once a base image finishes loading, so the caller can trigger a redraw. */
  constructor(private readonly onImageLoaded: () => void) {}

  /**
   * Returns the render-ready icon canvas for this unit + owning faction, or
   * null while the source image is still loading (a redraw fires
   * automatically once it's ready). `ownerId` is the faction id (e.g.
   * 'euto'); `color` is that faction's color, used as the tint when no
   * dedicated artwork exists for this (unitId, ownerId) pair.
   */
  getTintedIcon(unitId: string, ownerId: string | null, color: string): HTMLCanvasElement | null {
    const dedicatedPath = getFactionIconPath(unitId, ownerId);
    if (dedicatedPath) {
      return this.getRendered(dedicatedPath, `dedicated:${dedicatedPath}`, null);
    }
    const path = UNIT_ICON_IMAGE_PATHS[unitId];
    if (!path) {
      return null;
    }
    return this.getRendered(path, `${unitId}:${color}`, color);
  }

  /** Loads (if needed) the image at `path` and returns its cached, render-ready canvas — tinted with `tintColor`, or copied as-is when `tintColor` is null. */
  private getRendered(path: string, cacheKey: string, tintColor: string | null): HTMLCanvasElement | null {
    const cached = this.rendered.get(cacheKey);
    if (cached) {
      return cached;
    }

    const base = this.getBaseImage(path);
    if (!base.complete || base.naturalWidth === 0) {
      return null;
    }

    const canvas = tintColor === null ? copyImage(base) : tintImage(base, tintColor);
    this.rendered.set(cacheKey, canvas);
    return canvas;
  }

  private getBaseImage(path: string): HTMLImageElement {
    const cached = this.baseImages.get(path);
    if (cached) {
      return cached;
    }
    const image = new Image();
    image.onload = (): void => this.onImageLoaded();
    image.onerror = (): void => {
      // eslint-disable-next-line no-console
      console.error(`[UnitIconImageCache] Failed to load unit icon at ${path}`);
    };
    image.src = path;
    this.baseImages.set(path, image);
    return image;
  }
}

function copyImage(image: HTMLImageElement): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext('2d');
  if (context === null) {
    throw new Error('2D canvas context is not available in this environment');
  }
  context.drawImage(image, 0, 0);
  return canvas;
}

function tintImage(image: HTMLImageElement, color: string): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext('2d');
  if (context === null) {
    throw new Error('2D canvas context is not available in this environment');
  }
  context.drawImage(image, 0, 0);
  context.globalCompositeOperation = 'source-in';
  context.fillStyle = color;
  context.fillRect(0, 0, canvas.width, canvas.height);
  return canvas;
}
