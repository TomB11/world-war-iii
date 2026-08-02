import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AiDifficulty, AiDoctrine } from '../../models/ai-config.model';
import { SoloSetupState } from '../../state/solo-setup.state';

interface DoctrineOption {
  readonly id: AiDoctrine;
  readonly name: string;
  readonly description: string;
}

interface DifficultyOption {
  readonly id: AiDifficulty;
  readonly name: string;
  readonly description: string;
}

const DOCTRINE_OPTIONS: readonly DoctrineOption[] = [
  { id: 'aggressor', name: 'Aggressor', description: 'Prefers attacks, tanks and frontline pressure.' },
  { id: 'fortress', name: 'Fortress', description: 'Prefers defense, rockets and reinforced borders.' },
  { id: 'cyberState', name: 'Cyber State', description: 'Prefers hacking, sabotage and neutral influence.' },
];

const DIFFICULTY_OPTIONS: readonly DifficultyOption[] = [
  { id: 'easy', name: 'Easy', description: 'AI starts with -5 money.' },
  { id: 'normal', name: 'Normal', description: 'Standard rules.' },
  { id: 'hard', name: 'Hard', description: 'AI gains +3 money each turn.' },
  { id: 'nightmare', name: 'Nightmare', description: 'AI gains +5 money each turn and a free cyber attack every second turn.' },
];

/**
 * Second half of Solo Command Mode's pre-game setup (app.routes.ts path
 * 'solo-setup', reached from ChooseSideComponent): pick an AI Doctrine and
 * Difficulty for the alliance ChooseSideComponent did NOT select — that
 * alliance's 3 factions will be entirely AI-driven (services/ai-turn.service.ts)
 * once /game loads. "Skip" bypasses AI setup entirely and preserves today's
 * full hotseat play (every faction human-controlled).
 */
@Component({
  selector: 'wwiii-solo-setup',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './solo-setup.component.html',
  styleUrl: './solo-setup.component.scss',
})
export class SoloSetupComponent {
  private readonly router = inject(Router);
  private readonly soloSetup = inject(SoloSetupState);

  protected readonly doctrines = DOCTRINE_OPTIONS;
  protected readonly difficulties = DIFFICULTY_OPTIONS;

  protected readonly selectedDoctrine = signal<AiDoctrine | null>(null);
  protected readonly selectedDifficulty = signal<AiDifficulty | null>(null);

  protected selectDoctrine(id: AiDoctrine): void {
    this.selectedDoctrine.set(id);
  }

  protected selectDifficulty(id: AiDifficulty): void {
    this.selectedDifficulty.set(id);
  }

  protected canContinue(): boolean {
    return this.selectedDoctrine() !== null && this.selectedDifficulty() !== null;
  }

  protected continue(): void {
    const doctrine = this.selectedDoctrine();
    const difficulty = this.selectedDifficulty();
    const humanTeamId = this.soloSetup.humanTeamId();
    if (!doctrine || !difficulty || !humanTeamId) {
      return;
    }
    this.soloSetup.setSelection({ humanTeamId, doctrine, difficulty });
    void this.router.navigateByUrl('/game');
  }

  protected skip(): void {
    this.soloSetup.setSelection(null);
    void this.router.navigateByUrl('/game');
  }
}
