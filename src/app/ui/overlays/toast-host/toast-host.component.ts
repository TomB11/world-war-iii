import { ChangeDetectionStrategy, Component, Signal, effect, inject, signal } from '@angular/core';
import { GameStore } from '../../../state/store';
import { TOAST_DURATION_MS } from './toast-host.constants';

type ToastTone = 'error' | 'info';

interface ToastEntry {
  readonly id: number;
  readonly text: string;
  readonly tone: ToastTone;
}

/**
 * Global, transient feedback for command rejections and one-shot result
 * messages. Several panels that already render a rejection reason inline
 * (movement, economy, cyber attack, combat, phase advance) are only visible
 * in specific phases/states — e.g. wwiii-movement-panel hides itself outside
 * the Deploy/Transports cases — so a rejection can be set on the store with
 * nothing on screen to show it. This mirrors the same signals globally so a
 * rejection is always visible regardless of which panel (if any) is open.
 */
@Component({
  selector: 'wwiii-toast-host',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './toast-host.component.html',
  styleUrl: './toast-host.component.scss',
})
export class ToastHostComponent {
  private readonly store = inject(GameStore);
  private nextId = 0;
  protected readonly toasts = signal<readonly ToastEntry[]>([]);

  constructor() {
    this.watch(this.store.movementRejectionReason, 'error');
    this.watch(this.store.purchaseRejectionReason, 'error');
    this.watch(this.store.publicSpendingRejectionReason, 'error');
    this.watch(this.store.cyberAttackRejectionReason, 'error');
    this.watch(this.store.combatRejectionReason, 'error');
    this.watch(this.store.phaseAdvanceRejectionReason, 'error');
    this.watch(this.store.cyberAttackResultMessage, 'info');
    this.watch(this.store.missileStrikeMessage, 'info');
  }

  protected dismiss(id: number): void {
    this.toasts.update((list) => list.filter((toast) => toast.id !== id));
  }

  /** Pushes a toast whenever `source` changes to a non-null value. */
  private watch(source: Signal<string | null>, tone: ToastTone): void {
    let previous: string | null = null;
    effect(() => {
      const value = source();
      if (value !== null && value !== previous) {
        this.push(value, tone);
      }
      previous = value;
    });
  }

  private push(text: string, tone: ToastTone): void {
    const id = this.nextId++;
    this.toasts.update((list) => [...list, { id, text, tone }]);
    setTimeout(() => this.dismiss(id), TOAST_DURATION_MS);
  }
}
