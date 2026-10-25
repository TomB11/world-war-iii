import { ChangeDetectionStrategy, Component, Signal, effect, inject, signal } from '@angular/core';
import { GameCoreStore } from '../../../state/core/game-core.store';
import { CyberAttackStore } from '../../../state/cyber/cyber-attack.store';
import { CombatStore } from '../../../state/combat/combat.store';
import { TOAST_DURATION_MS } from './toast-host.constants';
import { getRejectionHint } from '../../../state/shared/rejection-hints';
import { REJECTION_TOAST_MS, REJECTION_TOAST_WITH_HINT_MS } from '../../../state/shared/rejection-hints.constants';

type ToastTone = 'error' | 'info';

interface ToastEntry {
  readonly id: number;
  readonly text: string;
  readonly tone: ToastTone;
  readonly hint: string | null;
  readonly count: number;
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
  private readonly gameCoreStore = inject(GameCoreStore);
  private readonly cyberAttackStore = inject(CyberAttackStore);
  private readonly combatStore = inject(CombatStore);
  private nextId = 0;
  protected readonly toasts = signal<readonly ToastEntry[]>([]);

  constructor() {
    // Rejections come through a counter-based notice so repeating the same mistake re-triggers the toast.
    let lastNoticeId = 0;
    effect(() => {
      const notice = this.gameCoreStore.rejectionNotice();
      if (notice && notice.id !== lastNoticeId) {
        lastNoticeId = notice.id;
        this.push(notice.reason, 'error');
      }
    });
    this.watch(this.cyberAttackStore.cyberAttackResultMessage, 'info');
    this.watch(this.combatStore.missileStrikeMessage, 'info');
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
    const hint = tone === 'error' ? getRejectionHint(text) : null;
    const duration = tone === 'info' ? TOAST_DURATION_MS : hint ? REJECTION_TOAST_WITH_HINT_MS : REJECTION_TOAST_MS;
    const repeated = this.toasts().find((toast) => toast.text === text && toast.tone === tone);
    const count = (repeated?.count ?? 0) + 1;
    this.toasts.update((list) => [...list.filter((toast) => toast !== repeated), { id, text, tone, hint, count }]);
    setTimeout(() => this.dismiss(id), duration);
  }
}