import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { BackgroundCarouselComponent } from '../../ui/shared/background-carousel/background-carousel.component';
import { MANUAL_PAGES, BACKGROUND_IMAGES } from './main-menu.constants';

/**
 * The app's first screen (app.routes.ts path ''): a title menu with a
 * cross-fading background (wwiii-background-carousel) and four actions.
 * "Start Game" navigates to /choose-side (ChooseSideComponent) rather than
 * straight to /game — GameScreenComponent still owns GameStore.initialize(),
 * this screen never touches game state. Prologue has no content yet, so
 * it's a placeholder overlay. Manual pages are pre-rendered images
 * (assets/menu/manual-*), paged one at a time.
 */
@Component({
  selector: 'wwiii-main-menu',
  standalone: true,
  imports: [BackgroundCarouselComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './main-menu.component.html',
  styleUrl: './main-menu.component.scss',
})
export class MainMenuComponent {
  protected readonly manualPages = MANUAL_PAGES;
  protected readonly backgroundImages = BACKGROUND_IMAGES;

  protected readonly showManual = signal(false);
  protected readonly manualPageIndex = signal(0);
  protected readonly manualZoomed = signal(false);
  protected readonly showPrologue = signal(false);
  protected readonly showExitMessage = signal(false);

  private readonly router = inject(Router);

  protected startGame(): void {
    void this.router.navigateByUrl('/choose-side');
  }

  protected openPrologue(): void {
    this.showPrologue.set(true);
  }

  protected closePrologue(): void {
    this.showPrologue.set(false);
  }

  protected openManual(): void {
    this.manualPageIndex.set(0);
    this.showManual.set(true);
  }

  protected closeManual(): void {
    this.showManual.set(false);
    this.manualZoomed.set(false);
  }

  protected nextManualPage(): void {
    this.manualPageIndex.update((i) => Math.min(i + 1, this.manualPages.length - 1));
  }

  protected prevManualPage(): void {
    this.manualPageIndex.update((i) => Math.max(i - 1, 0));
  }

  protected openManualZoom(): void {
    this.manualZoomed.set(true);
  }

  protected closeManualZoom(): void {
    this.manualZoomed.set(false);
  }

  /**
   * window.close() is a no-op in most browsers unless the tab was opened by
   * script — there's no reliable "did it work" callback. If we're still here
   * after a beat, it silently failed, so we show a fallback message instead.
   */
  protected exit(): void {
    window.close();
    setTimeout(() => this.showExitMessage.set(true), 200);
  }

  protected dismissExitMessage(): void {
    this.showExitMessage.set(false);
  }
}
