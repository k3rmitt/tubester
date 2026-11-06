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

  it('covers both ways to hear the music (same room or streamed)', () => {
    expect(PLAYER_STEPS[0].title).toBe('Listen to the song');
    expect(PLAYER_STEPS[0].body).toBe('It plays on your phone, or out loud in the room. Nobody sees the title or the year.');
    expect(HOST_STEPS[0]).toMatchObject({
      kicker: "1 · Where's the music?",
      title: 'Host from any device',
      body: "Host from a computer or a phone. **In the room**, one device plays the music out loud. **On everyone's phone**, the music is streamed to each phone from Chrome or Edge on a computer.",
    });
    expect(HOST_STEPS[2]).toMatchObject({
      kicker: '3 · Sound',
      title: 'Choose where the music plays',
      body: "**In the room**: pick the Spotify device that plays out loud (open the Spotify app on it first). **On everyone's phone**: press **Start broadcast**, choose **this tab** and keep **Also share tab audio** on.",
    });
    for (const s of HOST_STEPS) expect(s.body).not.toMatch(/this computer|Demo tones/);
  });
});
