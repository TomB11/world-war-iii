import { IncrementThreatCommand } from './increment-threat.command';
import { AiThreatTrackData } from '../../models/ai-threat-track.model';
import { aiConfig, player, testState } from '../test-fixtures';

describe('IncrementThreatCommand', () => {
  const threatTrackData: AiThreatTrackData = {
    maxLevel: 10,
    thresholds: [
      { level: 3, bonus: 'treasury', amount: 2 },
      { level: 5, bonus: 'freeCyberAttack' },
      { level: 10, bonus: 'totalWar' },
    ],
  };

  it('is a no-op when aiConfig is null (hotseat play)', () => {
    const state = testState({ phase: 'buyUnits', activePlayerId: 'p1', players: [player({ id: 'p1' })], aiConfig: null });
    const result = new IncrementThreatCommand('p1', threatTrackData).execute(state);
    expect(result.events).toEqual([]);
    expect(result.state).toBe(state);
  });

  it('is a no-op outside the Buy Units phase', () => {
    const state = testState({
      phase: 'attackMoves',
      activePlayerId: 'p1',
      players: [player({ id: 'p1' })],
      aiConfig: aiConfig({ aiTeamId: 'team-west' }),
    });
    const result = new IncrementThreatCommand('p1', threatTrackData).execute(state);
    expect(result.events).toEqual([]);
  });

  it('increments threatLevel by 1 and reports no crossed threshold on a non-threshold level', () => {
    const state = testState({
      phase: 'buyUnits',
      activePlayerId: 'p1',
      players: [player({ id: 'p1' })],
      aiConfig: aiConfig({ aiTeamId: 'team-west', threatLevel: 1 }),
    });
    const result = new IncrementThreatCommand('p1', threatTrackData).execute(state);
    expect(result.state.aiConfig?.threatLevel).toBe(2);
    const event = result.events[0];
    if (event?.type !== 'ThreatIncreased') {
      throw new Error('Expected a ThreatIncreased event');
    }
    expect(event.newLevel).toBe(2);
    expect(event.crossedThreshold).toBeNull();
  });

  it('reports the crossed threshold when threatLevel reaches a threshold level', () => {
    const state = testState({
      phase: 'buyUnits',
      activePlayerId: 'p1',
      players: [player({ id: 'p1' })],
      aiConfig: aiConfig({ aiTeamId: 'team-west', threatLevel: 2 }),
    });
    const result = new IncrementThreatCommand('p1', threatTrackData).execute(state);
    const event = result.events[0];
    if (event?.type !== 'ThreatIncreased') {
      throw new Error('Expected a ThreatIncreased event');
    }
    expect(event.newLevel).toBe(3);
    expect(event.crossedThreshold).toEqual({ level: 3, bonus: 'treasury', amount: 2 });
  });

  it('sets totalWarActive permanently once threatLevel reaches maxLevel', () => {
    const state = testState({
      phase: 'buyUnits',
      activePlayerId: 'p1',
      players: [player({ id: 'p1' })],
      aiConfig: aiConfig({ aiTeamId: 'team-west', threatLevel: 9 }),
    });
    const result = new IncrementThreatCommand('p1', threatTrackData).execute(state);
    expect(result.state.aiConfig?.threatLevel).toBe(10);
    expect(result.state.aiConfig?.totalWarActive).toBe(true);
  });

  it('emits no ThreatIncreased event once threatLevel is already at maxLevel, but still bumps aiTurnCounter', () => {
    const state = testState({
      phase: 'buyUnits',
      activePlayerId: 'p1',
      players: [player({ id: 'p1', aiTurnCounter: 4 })],
      aiConfig: aiConfig({ aiTeamId: 'team-west', threatLevel: 10, totalWarActive: true }),
    });
    const result = new IncrementThreatCommand('p1', threatTrackData).execute(state);
    expect(result.events).toEqual([]);
    expect(result.state.aiConfig?.threatLevel).toBe(10);
    expect(result.state.players.find((p) => p.id === 'p1')?.aiTurnCounter).toBe(5);
  });

  it('bumps this player\'s own aiTurnCounter by 1 every time (Nightmare difficulty needs this even while threatLevel keeps changing)', () => {
    const state = testState({
      phase: 'buyUnits',
      activePlayerId: 'p1',
      players: [player({ id: 'p1' })],
      aiConfig: aiConfig({ aiTeamId: 'team-west', threatLevel: 1 }),
    });
    const result = new IncrementThreatCommand('p1', threatTrackData).execute(state);
    expect(result.state.players.find((p) => p.id === 'p1')?.aiTurnCounter).toBe(1);
  });
});
