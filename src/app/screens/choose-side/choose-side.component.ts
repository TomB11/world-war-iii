import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { SoloSetupState } from '../../state/solo-setup.state';

export type AllianceSide = 'west' | 'east';

const TEAM_ID_BY_SIDE: Readonly<Record<AllianceSide, string>> = {
  west: 'team-west',
  east: 'team-east',
};

/**
 * Intro screen between the main menu and the game itself (app.routes.ts
 * path 'choose-side'): a single background image split into two transparent
 * click zones — left picks the Western Allies (EUTO/USA/SEATO, teamId
 * 'team-west' in data/factions.json), right picks the Eurasian Pact
 * (Russia/China/Arabia League, 'team-east'). This is the human's alliance
 * for Solo Command Mode — the pick is handed to SoloSetupState and the next
 * screen ('solo-setup') lets the player choose an AI Doctrine/Difficulty for
 * the opposing alliance, or skip straight into today's full hotseat play.
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
  private readonly soloSetup = inject(SoloSetupState);

  protected readonly backgroundImage = 'assets/menu/choose.jpg';
  protected readonly selectedSide = signal<AllianceSide | null>(null);

  protected selectSide(side: AllianceSide): void {
    this.selectedSide.set(side);
  }

  protected continue(): void {
    const side = this.selectedSide();
    if (!side) {
      return;
    }
    this.soloSetup.setHumanTeamId(TEAM_ID_BY_SIDE[side]);
    void this.router.navigateByUrl('/solo-setup');
  }
}
