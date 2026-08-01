import { GamePhase } from '../../models/game-state.model';

/**
 * Display label for each turn phase (PROJECT_RULES.md section 3), shared by
 * every panel that shows the current phase (PhaseStepperComponent,
 * TurnPanelComponent) so the wording can never drift between them — append
 * " Phase" at the call site where a fuller label reads better (TurnPanelComponent).
 */
export const PHASE_LABELS: Readonly<Record<GamePhase, string>> = {
  buyUnits: 'Buy Units',
  cyberAttack: 'Cyber Attack',
  attackMoves: 'Attack Moves',
  attack: 'Attack',
  tacticalMoves: 'Tactical Moves',
  placeNewUnits: 'Place New Units',
  collectIncome: 'Collect Income',
};
