/** Pixel geometry of the magnifier lens over a manual page, relative to the page frame. */
export interface ManualLens {
  readonly left: number;
  readonly top: number;
  readonly size: number;
  readonly bgWidth: number;
  readonly bgHeight: number;
  readonly bgX: number;
  readonly bgY: number;
}
