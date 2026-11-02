import { describe, expect, it } from 'vitest';
import { FakeMusicSource, type ToneOutput } from './fake';
import { MusicRouter } from './router';
import type { PlaybackError } from './types';

const silent: ToneOutput = { start: () => undefined, stop: () => undefined };

describe('MusicRouter', () => {
  it('plays through the active source and stops the old one on switch', async () => {
    const a = new FakeMusicSource(silent);
    const b = new FakeMusicSource(silent);
    const stops: string[] = [];
    a.stop = async () => {
      stops.push('a');
    };
    const router = new MusicRouter(a);
    await router.play('demo-01');
    router.use(b);
    await router.play('demo-02');
    expect([a.played, b.played, stops]).toEqual([['demo-01'], ['demo-02'], ['a']]);
    expect(await router.listPlaylists()).toEqual(await b.listPlaylists());
  });

  it('forwards errors only from the active source', async () => {
    const a = new FakeMusicSource(silent);
    const b = new FakeMusicSource(silent);
    const router = new MusicRouter(a);
    const errors: PlaybackError[] = [];
    router.onError((e) => errors.push(e));
    router.use(b);
    router.use(a);
    router.use(b);
    a.failNext = true;
    await a.play('demo-01');
    b.failNext = true;
    await b.play('demo-02');
    expect(errors).toEqual([{ trackId: 'demo-02', message: 'simulated failure' }]);
  });

  it('pauses and resumes the active source', async () => {
    const a = new FakeMusicSource(silent);
    const calls: string[] = [];
    a.pause = async () => {
      calls.push('pause');
    };
    a.resume = async () => {
      calls.push('resume');
    };
    const router = new MusicRouter(a);
    await router.pause();
    await router.resume();
    expect(calls).toEqual(['pause', 'resume']);
  });
});
