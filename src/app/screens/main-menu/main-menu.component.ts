import { ChangeDetectionStrategy, Component, computed, ElementRef, inject, signal, viewChild } from '@angular/core';
import { Router } from '@angular/router';
import { BackgroundCarouselComponent } from '../../ui/shared/background-carousel/background-carousel.component';
import { SaveGameService } from '../../services/save-game.service';
import { MANUAL_PAGES, PROLOGUE_PAGES, BACKGROUND_IMAGES, MANUAL_LENS_SIZE, MANUAL_LENS_ZOOM } from './main-menu.constants';
import { ManualLens } from './manual-lens.model';

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
  protected readonly backgroundImages = BACKGROUND_IMAGES;

  protected readonly showManual = signal(false);
  protected readonly showPrologue = signal(false);
  /** The manual and the prologue share one paged image viewer; this is whichever is open. */
  protected readonly manualPages = computed(() => (this.showPrologue() ? PROLOGUE_PAGES : MANUAL_PAGES));
  protected readonly viewerOpen = computed(() => this.showManual() || this.showPrologue());
  protected readonly manualPageIndex = signal(0);
  protected readonly manualZoomed = signal(false);
  protected readonly lens = signal<ManualLens | null>(null);
  protected readonly showExitMessage = signal(false);
  protected readonly importError = signal<string | null>(null);

  private readonly router = inject(Router);
  private readonly saveGameService = inject(SaveGameService);

  /** Whether a localStorage quick-save exists — computed once, since MainMenuComponent is re-instantiated every time the route navigates back here. */
  protected readonly hasSavedGame = signal(this.saveGameService.hasLocalStorageSave());

  private readonly saveFileInput = viewChild.required<ElementRef<HTMLInputElement>>('saveFileInput');

  protected startGame(): void {
    void this.router.navigateByUrl('/choose-side');
  }

  protected continueGame(): void {
    const savedState = this.saveGameService.loadFromLocalStorage();
    if (!savedState) {
      return;
    }
    this.saveGameService.setPendingLoad(savedState);
    void this.router.navigateByUrl('/game');
  }

  protected triggerImport(): void {
    this.saveFileInput().nativeElement.click();
  }

  protected async onSaveFileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    input.value = '';
    if (!file) {
      return;
    }
    try {
      const savedState = await this.saveGameService.importFromFile(file);
      this.saveGameService.setPendingLoad(savedState);
      void this.router.navigateByUrl('/game');
    } catch (error) {
      this.importError.set(error instanceof Error ? error.message : 'Failed to load save file.');
    }
  }

  protected dismissImportError(): void {
    this.importError.set(null);
  }

  protected openPrologue(): void {
    this.manualPageIndex.set(0);
    this.showPrologue.set(true);
  }

  protected openManual(): void {
    this.manualPageIndex.set(0);
    this.showManual.set(true);
  }

  protected closeViewer(): void {
    this.showManual.set(false);
    this.showPrologue.set(false);
    this.manualZoomed.set(false);
    this.lens.set(null);
  }

  protected nextManualPage(): void {
    this.manualPageIndex.update((i) => Math.min(i + 1, this.manualPages().length - 1));
  }

  protected prevManualPage(): void {
    this.manualPageIndex.update((i) => Math.max(i - 1, 0));
  }

  protected moveLens(event: MouseEvent): void {
    const frame = event.currentTarget as HTMLElement;
    const rect = frame.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    if (x < 0 || y < 0 || x > rect.width || y > rect.height) {
      this.lens.set(null);
      return;
    }
    const size = MANUAL_LENS_SIZE;
    this.lens.set({
      left: x - size / 2,
      top: y - size / 2,
      size,
      bgWidth: rect.width * MANUAL_LENS_ZOOM,
      bgHeight: rect.height * MANUAL_LENS_ZOOM,
      bgX: size / 2 - x * MANUAL_LENS_ZOOM,
      bgY: size / 2 - y * MANUAL_LENS_ZOOM,
    });
  }

  protected hideLens(): void {
    this.lens.set(null);
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
