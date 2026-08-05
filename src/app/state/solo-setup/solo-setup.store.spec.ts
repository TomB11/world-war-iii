import { TestBed } from '@angular/core/testing';
import { SoloSetupStore } from './solo-setup.store';

describe('SoloSetupStore', () => {
  function setup(): InstanceType<typeof SoloSetupStore> {
    TestBed.configureTestingModule({});
    return TestBed.inject(SoloSetupStore);
  }

  it('starts with no human team and no selection (today\'s full hotseat default)', () => {
    const store = setup();
    expect(store.humanTeamId()).toBeNull();
    expect(store.selection()).toBeNull();
  });

  it('setHumanTeamId records the pick from ChooseSideComponent', () => {
    const store = setup();
    store.setHumanTeamId('team-west');
    expect(store.humanTeamId()).toBe('team-west');
  });

  it('setSelection records the full Solo Command Mode selection from SoloSetupComponent', () => {
    const store = setup();
    store.setHumanTeamId('team-west');
    store.setSelection({ humanTeamId: 'team-west', doctrine: 'aggressor', difficulty: 'hard' });
    expect(store.selection()).toEqual({ humanTeamId: 'team-west', doctrine: 'aggressor', difficulty: 'hard' });
  });

  it('setSelection(null) preserves the "skip" (full hotseat) path', () => {
    const store = setup();
    store.setSelection({ humanTeamId: 'team-east', doctrine: 'fortress', difficulty: 'normal' });
    store.setSelection(null);
    expect(store.selection()).toBeNull();
  });
});
