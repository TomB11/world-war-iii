import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, input } from '@angular/core';

let nextCarouselId = 0;

/**
 * Full-bleed background of N images cross-fading forever, one at a time
 * (e.g. main-menu's title screen). Each image gets the same CSS animation
 * (one full fade-in/hold/fade-out cycle spanning the whole loop), staggered
 * by its index * secondsPerImage via animation-delay, so while one is
 * fading out the next is fading in.
 *
 * The keyframe percentages depend on how many images there are (each image's
 * "on" window is 1/images().length of the total loop), so a static SCSS
 * @keyframes block can't serve an arbitrary image count — this generates one
 * scoped to this instance's own animation name and injects it via a <style>
 * tag instead, computed once from the images/timing inputs.
 */
@Component({
  selector: 'wwiii-background-carousel',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './background-carousel.component.html',
  styleUrl: './background-carousel.component.scss',
})
export class BackgroundCarouselComponent implements OnInit, OnDestroy {
  readonly images = input.required<readonly string[]>();
  /** How long each image holds fully visible, including its own fade in/out. */
  readonly secondsPerImage = input(5);
  /** Fade transition length; must be well under secondsPerImage / 2 or the fade-in/fade-out windows overlap. */
  readonly fadeSeconds = input(1.5);

  protected readonly animationName = `wwiii-bg-carousel-fade-${nextCarouselId++}`;

  private styleEl: HTMLStyleElement | null = null;

  protected get totalDuration(): number {
    return this.images().length * this.secondsPerImage();
  }

  protected animationDelay(index: number): number {
    return index * this.secondsPerImage();
  }

  ngOnInit(): void {
    if (this.images().length === 0) {
      return;
    }
    const total = this.totalDuration;
    const fadeInEndPct = (this.fadeSeconds() / total) * 100;
    const holdEndPct = ((this.secondsPerImage() - this.fadeSeconds()) / total) * 100;
    const segmentEndPct = (this.secondsPerImage() / total) * 100;

    this.styleEl = document.createElement('style');
    this.styleEl.textContent = `
      @keyframes ${this.animationName} {
        0% { opacity: 0; }
        ${fadeInEndPct}% { opacity: 1; }
        ${holdEndPct}% { opacity: 1; }
        ${segmentEndPct}% { opacity: 0; }
        100% { opacity: 0; }
      }
    `;
    document.head.appendChild(this.styleEl);
  }

  ngOnDestroy(): void {
    this.styleEl?.remove();
  }
}
