import { ChangeDetectionStrategy, Component, ElementRef, inject, signal, viewChild } from '@angular/core';
import { GameCoreStore } from '../../../state/core/game-core.store';
import { AiStore } from '../../../state/ai/ai.store';
import { SaveGameService } from '../../../services/save-game.service';

/**
 * Header-level Save/Export/Import controls (PROJECT_RULES.txt section 40:
 * "Entire game state must be saved"). Save is a localStorage quick-save
 * consumed by MainMenuComponent's "Continue"; Export/Import round-trip the
 * same GameState through a downloaded JSON file for backups or moving a
 * save between machines.
 */
@Component({
  selector: 'wwiii-save-load-panel',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './save-load-panel.component.html',
  styleUrl: './save-load-panel.component.scss',
})
export class SaveLoadPanelComponent {
  protected readonly gameCoreStore = inject(GameCoreStore);
  private readonly aiStore = inject(AiStore);
  private readonly saveGameService = inject(SaveGameService);

  private readonly fileInput = viewChild.required<ElementRef<HTMLInputElement>>('fileInput');

  protected readonly message = signal<string | null>(null);
  protected readonly messageIsError = signal(false);

  protected save(): void {
    if (this.gameCoreStore.saveGame()) {
      this.showMessage('Game saved.', false);
    }
  }

  protected exportSave(): void {
    this.gameCoreStore.exportSave();
  }

  protected triggerImport(): void {
    this.fileInput().nativeElement.click();
  }

  protected async onFileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    input.value = '';
    if (!file) {
      return;
    }
    if (!confirm('Loading a save replaces your current progress. Continue?')) {
      return;
    }
    try {
      const savedState = await this.saveGameService.importFromFile(file);
      const data = await this.gameCoreStore.loadGame(savedState);
      if (data) {
        this.aiStore.setStaticAiData(data);
        this.showMessage('Save loaded.', false);
      } else {
        this.showMessage(this.gameCoreStore.loadError() ?? 'Failed to load save file.', true);
      }
    } catch (error) {
      this.showMessage(error instanceof Error ? error.message : 'Failed to load save file.', true);
    }
  }

  private showMessage(text: string, isError: boolean): void {
    this.message.set(text);
    this.messageIsError.set(isError);
    setTimeout(() => this.message.set(null), 3000);
  }
}
