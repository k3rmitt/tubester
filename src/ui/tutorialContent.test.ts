import { describe, expect, it } from 'vitest';
import { type KeyValueStorage, memoryStorage } from '../util/storage';
import { HOST_STEPS, markSeen, PLAYER_STEPS, readSeen, shouldShowTutorial, tutorialFor } from './tutorialContent';

describe('tutorialFor', () => {
  it('gives invite links the participant tutorial and everything else the host one', () => {
    expect(tutorialFor({ name: 'join', code: 'TUBE-AB12' })).toBe('player');
    expect(tutorialFor({ name: 'home' })).toBe('host');
    expect(tutorialFor({ name: 'host' })).toBe('host');
  });
});

describe('shouldShowTutorial', () => {
  it('shows once per role after a splash', () => {
    expect(shouldShowTutorial({ role: 'player', seen: {}, splash: 'full' })).toBe(true);
    expect(shouldShowTutorial({ role: 'player', seen: {}, splash: 'still' })).toBe(true);
    expect(shouldShowTutorial({ role: 'player', seen: { player: true }, splash: 'full' })).toBe(false);
    expect(shouldShowTutorial({ role: 'player', seen: { host: true }, splash: 'full' })).toBe(true);
  });
  it('never shows when the splash was skipped', () => {
    expect(shouldShowTutorial({ role: 'host', seen: {}, splash: 'none' })).toBe(false);
  });
});

describe('seen storage', () => {
  it('remembers each role separately', () => {
    const s = memoryStorage();
    expect(readSeen(s)).toEqual({});
    markSeen(s, 'host');
    expect(readSeen(s)).toEqual({ host: true });
    markSeen(s, 'player');
    expect(readSeen(s)).toEqual({ host: true, player: true });
  });
  it('never throws on broken or blocked storage', () => {
    const broken: KeyValueStorage = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
      removeItem: () => undefined,
    };
    expect(readSeen(broken)).toEqual({});
    expect(() => markSeen(broken, 'host')).not.toThrow();
    const junk = memoryStorage();
    junk.setItem('tubester.tutorial', '{nope');
    expect(readSeen(junk)).toEqual({});
  });
});

describe('steps', () => {
  it('has six steps each, no emoji, and never the forbidden brand', () => {
    for (const steps of [HOST_STEPS, PLAYER_STEPS]) {
      expect(steps).toHaveLength(6);
      for (const s of steps) {
        expect(s.title.length).toBeGreaterThan(0);
        expect(s.body.length).toBeGreaterThan(0);
        expect(`${s.kicker}${s.title}${s.body}`).not.toMatch(/\p{Extended_Pictographic}|hitster/iu);
      }
    }
  });
});
