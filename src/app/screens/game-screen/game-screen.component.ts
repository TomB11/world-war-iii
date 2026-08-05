import { ChangeDetectionStrategy, Component, OnInit, inject } from '@angular/core';
import { WorldMapComponent } from '../../ui/map/world-map/world-map.component';
import { RegionInfoPanelComponent } from '../../ui/panels/region-info-panel/region-info-panel.component';
import { EconomyPanelComponent } from '../../ui/panels/economy-panel/economy-panel.component';
import { TurnPanelComponent } from '../../ui/panels/turn-panel/turn-panel.component';
import { MovementPanelComponent } from '../../ui/panels/movement-panel/movement-panel.component';
import { AdvancePhaseBarComponent } from '../../ui/panels/advance-phase-bar/advance-phase-bar.component';
import { CitizenSatisfactionTrackComponent } from '../../ui/panels/citizen-satisfaction-track/citizen-satisfaction-track.component';
import { ThreatTrackComponent } from '../../ui/panels/threat-track/threat-track.component';
import { HackLevelIndicatorComponent } from '../../ui/panels/hack-level-indicator/hack-level-indicator.component';
import { CyberAttackPanelComponent } from '../../ui/panels/cyber-attack-panel/cyber-attack-panel.component';
import { PhaseStepperComponent } from '../../ui/panels/phase-stepper/phase-stepper.component';
import { VictoryBannerComponent } from '../../ui/overlays/victory-banner/victory-banner.component';
import { CombatBoardComponent } from '../../ui/overlays/combat-board/combat-board.component';
import { ToastHostComponent } from '../../ui/overlays/toast-host/toast-host.component';
import { AiTurnSummaryComponent } from '../../ui/overlays/ai-turn-summary/ai-turn-summary.component';
import { GameCoreStore } from '../../state/core/game-core.store';
import { AiStore } from '../../state/ai/ai.store';
import { AiTurnService } from '../../services/ai-turn.service';

@Component({
  selector: 'wwiii-game-screen',
  standalone: true,
  imports: [
    WorldMapComponent,
    RegionInfoPanelComponent,
    EconomyPanelComponent,
    TurnPanelComponent,
    MovementPanelComponent,
    AdvancePhaseBarComponent,
    CitizenSatisfactionTrackComponent,
    ThreatTrackComponent,
    HackLevelIndicatorComponent,
    CyberAttackPanelComponent,
    PhaseStepperComponent,
    VictoryBannerComponent,
    CombatBoardComponent,
    ToastHostComponent,
    AiTurnSummaryComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './game-screen.component.html',
  styleUrl: './game-screen.component.scss',
})
export class GameScreenComponent implements OnInit {
  protected readonly gameCoreStore = inject(GameCoreStore);
  private readonly aiStore = inject(AiStore);
  /** Unused directly — injecting forces AiTurnService's constructor (and its state-watching effect) to run for the lifetime of a game, exactly like GameCoreStore itself is force-instantiated here. */
  private readonly aiTurnService = inject(AiTurnService);

  async ngOnInit(): Promise<void> {
    const data = await this.gameCoreStore.initialize();
    if (data) {
      this.aiStore.setStaticAiData(data);
    }
  }
}
