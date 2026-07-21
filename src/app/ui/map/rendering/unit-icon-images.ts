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
 * Loads each unit's silhouette artwork once (assets/units/*.png — solid
 * shape, transparent background) and produces faction-colored variants on
 * demand, cached by "unitId:color". Tinting composites a solid fill through
 * the source image's alpha channel ('source-in'), so whatever RGB is baked
 * into the source silhouette is discarded — only its shape matters.
 */
export class UnitIconImageCache {
  private readonly baseImages = new Map<string, HTMLImageElement>();
  private readonly tinted = new Map<string, HTMLCanvasElement>();

  /** Called once a base image finishes loading, so the caller can trigger a redraw. */
  constructor(private readonly onImageLoaded: () => void) {}

  /** Returns the tinted icon canvas, or null while the source image is still loading (a redraw fires automatically once it's ready). */
  getTintedIcon(unitId: string, color: string): HTMLCanvasElement | null {
    const cacheKey = `${unitId}:${color}`;
    const cached = this.tinted.get(cacheKey);
    if (cached) {
      return cached;
    }

    const base = this.getBaseImage(unitId);
    if (!base || !base.complete || base.naturalWidth === 0) {
      return null;
    }

    const tintedCanvas = tintImage(base, color);
    this.tinted.set(cacheKey, tintedCanvas);
    return tintedCanvas;
  }

  private getBaseImage(unitId: string): HTMLImageElement | null {
    const cached = this.baseImages.get(unitId);
    if (cached) {
      return cached;
    }
    const path = UNIT_ICON_IMAGE_PATHS[unitId];
    if (!path) {
      return null;
    }
    const image = new Image();
    image.onload = (): void => this.onImageLoaded();
    image.onerror = (): void => {
      // eslint-disable-next-line no-console
      console.error(`[UnitIconImageCache] Failed to load unit icon at ${path}`);
    };
    image.src = path;
    this.baseImages.set(unitId, image);
    return image;
  }
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
