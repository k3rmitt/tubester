import { describe, expect, it } from 'vitest';
import { DEMO_TRACKS } from './demo';
import { FakeMusicSource, freqFor, type ToneOutput } from './fake';
import type { PlaybackError } from './types';

function recorder() {
  const calls: string[] = [];
  const tone: ToneOutput = {
    start: (f) => calls.push(`start ${f}`),
    stop: () => calls.push('stop'),
  };
  return { tone, calls };
}

describe('DEMO_TRACKS', () => {
  it('has 40 well-formed tracks with unique ids', () => {
    expect(DEMO_TRACKS).toHaveLength(40);
    expect(new Set(DEMO_TRACKS.map((t) => t.id)).size).toBe(40);
    for (const t of DEMO_TRACKS) {
      expect(t.title.length).toBeGreaterThan(0);
      expect(t.artists.length).toBeGreaterThan(0);
      expect(t.sourceYear).toBeGreaterThanOrEqual(1950);
      expect(t.sourceYear).toBeLessThanOrEqual(2025);
    }
  });
});

describe('freqFor', () => {
  it('is deterministic and audible', () => {
    expect(freqFor('demo-01')).toBe(freqFor('demo-01'));
    for (const t of DEMO_TRACKS) {
      expect(freqFor(t.id)).toBeGreaterThanOrEqual(220);
      expect(freqFor(t.id)).toBeLessThan(660);
    }
  });
});

describe('FakeMusicSource', () => {
  it('exposes one demo playlist and returns copies of its tracks', async () => {
    const src = new FakeMusicSource(recorder().tone);
    expect(await src.listPlaylists()).toEqual([{ id: 'demo', name: 'Demo hits', trackCount: 40 }]);
    const tracks = await src.loadPlaylist('demo');
    tracks[0].artists.push('mutated');
    expect(DEMO_TRACKS[0].artists).toHaveLength(1);
    await expect(src.loadPlaylist('nope')).rejects.toThrow('unknown playlist nope');
  });

  it('plays a tone per track and stops it', async () => {
    const { tone, calls } = recorder();
    const src = new FakeMusicSource(tone);
    await src.play('demo-03');
    await src.stop();
    expect(calls).toEqual([`start ${freqFor('demo-03')}`, 'stop']);
    expect(src.played).toEqual(['demo-03']);
  });

  it('can simulate a playback failure once', async () => {
    const { tone, calls } = recorder();
    const src = new FakeMusicSource(tone);
    const errors: PlaybackError[] = [];
    src.onError((e) => errors.push(e));
    src.failNext = true;
    await src.play('demo-05');
    await src.play('demo-06');
    expect(errors).toEqual([{ trackId: 'demo-05', message: 'simulated failure' }]);
    expect(src.played).toEqual(['demo-06']);
    expect(calls).toEqual([`start ${freqFor('demo-06')}`]);
  });
});
