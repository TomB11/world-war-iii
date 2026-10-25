import { ChangeDetectionStrategy, Component, DestroyRef, effect, inject, input, output, signal } from '@angular/core';
import { DICE_SIDES } from '../../../../engine/constants/dice.constants';
import { CombatDieRoll } from '../../../../models/region-combat.model';
import { UnitIconComponent } from '../../../shared/unit-icon/unit-icon.component';

/**
 * One unit's icon + optional die-roll badge on the combat board — one of
 * three shapes: a clickable "pick this one as a casualty" button
 * (still-alive units), an inert casualty slot (dead units, shown smaller and
 * grayscale via CSS), or an armed-missile placeholder (pulsing glow, no
 * roll badge, awaiting FireMissileCommand). Shared by both attacker/defender
 * columns' live/casualty rows and the armed-missile slot — previously five
 * near-identical blocks in CombatBoardComponent's template.
 */
@Component({
  selector: 'wwiii-combat-unit-slot',
  standalone: true,
  imports: [UnitIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './combat-unit-slot.component.html',
  styleUrl: './combat-unit-slot.component.scss',
})
export class CombatUnitSlotComponent {
  readonly unitId = input.required<string>();
  readonly unitName = input.required<string>();
  readonly ownerId = input<string | null>(null);
  readonly color = input<string>('#888888');
  readonly size = input<number>(34);
  readonly rollInfo = input<CombatDieRoll | null>(null);
  /** Still alive (clickable button) vs a casualty/armed-missile (inert display). */
  readonly interactive = input<boolean>(false);
  /** Only meaningful while `interactive` — whether this side is currently allowed to pick a casualty. */
  readonly clickable = input<boolean>(false);
  /** Only meaningful while not `interactive` — an armed missile awaiting its roll, instead of an ordinary casualty. */
  readonly armed = input<boolean>(false);

  readonly unitClick = output<void>();

  /** Briefly true right after a fresh roll lands, driving a one-shot "pop" on the roll badge (CombatDieRoll is a new object every round, even when a unit rolls the same number twice, so reference inequality alone marks a new roll — see constructor). */
  protected readonly rollJustLanded = signal(false);
  /** True while the die is still tumbling through random faces, before it settles on the real result. */
  protected readonly rolling = signal(false);
  /** The face currently shown on the badge: a random one while tumbling, the real result once landed. */
  protected readonly shownValue = signal(1);
  /** One-shot hit/miss effect on the whole slot, set the moment the die lands and cleared after it plays. */
  protected readonly outcomeFx = signal<'hit' | 'miss' | null>(null);
  private lastRollInfo: CombatDieRoll | null = null;
  private timers: ReturnType<typeof setTimeout>[] = [];
  private tumbleInterval: ReturnType<typeof setInterval> | null = null;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.clearTimers());
    effect(() => {
      const roll = this.rollInfo();
      if (roll && roll !== this.lastRollInfo) {
        this.playRoll(roll);
      }
      this.lastRollInfo = roll;
    });
  }

  /** Purely cosmetic: random faces never touch game state, the real (seeded) result is always what lands. */
  private playRoll(roll: CombatDieRoll): void {
    this.clearTimers();
    const reduceMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    const land = (): void => {
      this.clearTimers();
      this.rolling.set(false);
      this.shownValue.set(roll.roll);
      this.rollJustLanded.set(true);
      this.outcomeFx.set(roll.hit ? 'hit' : 'miss');
      this.timers.push(setTimeout(() => this.rollJustLanded.set(false), 420));
      this.timers.push(setTimeout(() => this.outcomeFx.set(null), 900));
    };
    if (reduceMotion) {
      land();
      return;
    }
    this.rolling.set(true);
    this.rollJustLanded.set(false);
    this.outcomeFx.set(null);
    this.tumbleInterval = setInterval(() => this.shownValue.set(1 + Math.floor(Math.random() * DICE_SIDES)), 70);
    this.timers.push(setTimeout(land, TUMBLE_DURATION_MS));
  }

  private clearTimers(): void {
    for (const timer of this.timers) {
      clearTimeout(timer);
    }
    this.timers = [];
    if (this.tumbleInterval !== null) {
      clearInterval(this.tumbleInterval);
      this.tumbleInterval = null;
    }
  }
}

const TUMBLE_DURATION_MS = 650;
