import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';

export type AllianceSide = 'west' | 'east';

/**
 * Intro screen between the main menu and the game itself (app.routes.ts
 * path 'choose-side'): a single background image split into two transparent
 * click zones — left picks the Western Allies (EUTO/USA/SEATO, teamId
 * 'team-west' in data/factions.json), right picks the Eurasian Pact
 * (Russia/China/Arabia League, 'team-east'). Purely a mood-setting choice
 * for now — this is a hotseat game where every faction still takes its own
 * turn regardless of which half was clicked, so the pick isn't threaded into
 * GameStore. Continue only appears once a side is chosen, then navigates to
 * /game the same way MainMenuComponent's "Start Game" used to.
 */
@Component({
  selector: 'wwiii-choose-side',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './choose-side.component.html',
  styleUrl: './choose-side.component.scss',
})
export class ChooseSideComponent {
  private readonly router = inject(Router);

  protected readonly backgroundImage = 'assets/menu/choose.jpg';
  protected readonly selectedSide = signal<AllianceSide | null>(null);

  protected selectSide(side: AllianceSide): void {
    this.selectedSide.set(side);
  }

  protected continue(): void {
    if (!this.selectedSide()) {
      return;
    }
    void this.router.navigateByUrl('/game');
  }
}
