import { describe, expect, it } from 'vitest';
import { HttpError } from '../../util/http';
import type { PlaybackError } from '../types';
import { type ConnectApi, SpotifyConnectSource } from './connect';

const KITCHEN = { id: 'd1', name: 'Kitchen' };

/** `plays` scripts each play call: 'ok', a status code to fail with, or a promise to wait on first. */
function setup(plays: ('ok' | number | Promise<void>)[] = [], device: { id: string; name: string } | null = KITCHEN) {
  const calls: string[] = [];
  const api: ConnectApi = {
    listPlaylists: async () => [],
    loadPlaylist: async () => [],
    play: async (id, track) => {
      calls.push(`play ${id} ${track}`);
      const next = plays.shift() ?? 'ok';
      if (next instanceof Promise) await next;
      else if (next !== 'ok') throw new HttpError(next, `failed ${next}`);
    },
    pause: async (id) => {
      calls.push(`pause ${id}`);
    },
    resume: async (id) => {
      calls.push(`resume ${id}`);
    },
    transfer: async (id) => {
      calls.push(`transfer ${id}`);
    },
  };
  const errors: PlaybackError[] = [];
  const source = new SpotifyConnectSource(api, () => device);
  source.onError((e) => errors.push(e));
  return { source, calls, errors };
}

describe('SpotifyConnectSource', () => {
  it('is ready at once and plays the track on the picked device', async () => {
    const { source, calls, errors } = setup();
    await source.ready();
    await source.play('t1');
    expect(calls).toEqual(['play d1 t1']);
    expect(errors).toEqual([]);
  });

  it('wakes an idle device with a transfer, then plays again', async () => {
    const { source, calls, errors } = setup([404, 'ok']);
    await source.play('t1');
    expect(calls).toEqual(['play d1 t1', 'transfer d1', 'play d1 t1']);
    expect(errors).toEqual([]);
  });

  it('reports the device by name when it still cannot be reached', async () => {
    const { source, errors } = setup([404, 404]);
    await source.play('t1');
    expect(errors).toEqual([{ trackId: 't1', message: "Can't reach Kitchen. Open Spotify on it, then try again." }]);
  });

  it('reports other failures the same way, without a transfer', async () => {
    const { source, calls, errors } = setup([502]);
    await source.play('t1');
    expect(calls).toEqual(['play d1 t1']);
    expect(errors).toHaveLength(1);
  });

  it('asks for a device when none is picked', async () => {
    const { source, calls, errors } = setup([], null);
    await source.play('t1');
    expect(calls).toEqual([]);
    expect(errors).toEqual([{ trackId: 't1', message: 'Pick a Spotify device to play on' }]);
  });

  it('pauses again when pause arrives while play is in flight', async () => {
    let release: () => void = () => undefined;
    const held = new Promise<void>((r) => {
      release = r;
    });
    const { source, calls } = setup([held]);
    const playing = source.play('t1');
    await source.pause();
    release();
    await playing;
    expect(calls).toEqual(['play d1 t1', 'pause d1', 'pause d1']);
  });

  it('pauses, resumes and stops on the device', async () => {
    const { source, calls } = setup();
    await source.play('t1');
    await source.pause();
    await source.resume();
    await source.stop();
    expect(calls).toEqual(['play d1 t1', 'pause d1', 'resume d1', 'pause d1']);
  });

  it('makes no call for stop, pause or resume before anything played', async () => {
    const { source, calls } = setup();
    await source.stop();
    await source.pause();
    await source.resume();
    expect(calls).toEqual([]);
  });

  it('stays quiet about an older track that failed after a newer one started', async () => {
    let fail: (e: Error) => void = () => undefined;
    const held = new Promise<void>((_, reject) => {
      fail = reject;
    });
    const { source, errors } = setup([held, 'ok']);
    const first = source.play('t1');
    await source.play('t2');
    fail(new HttpError(502, 'late failure'));
    await first;
    expect(errors).toEqual([]);
  });
});
