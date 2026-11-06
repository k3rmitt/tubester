import { afterEach, describe, expect, it, vi } from 'vitest';
import { HttpError } from '../../util/http';
import type { PlaybackError } from '../types';
import { PREMIUM_REQUIRED, type SdkPlayer, type SpotifyApiLike, SpotifyMusicSource } from './source';

function fakePlayer(connectResult = true) {
  const listeners = new Map<string, (p: unknown) => void>();
  let activated = 0;
  let disconnected = 0;
  const player: SdkPlayer = {
    connect: async () => connectResult,
    disconnect: () => {
      disconnected++;
    },
    activateElement: async () => {
      activated++;
    },
    addListener: (event, cb) => {
      listeners.set(event, cb);
      return true;
    },
  };
  return {
    player,
    emit: (event: string, payload: unknown) => listeners.get(event)?.(payload),
    activated: () => activated,
    disconnected: () => disconnected,
  };
}

function fakeApi(failPlay = false, holdPlay: Promise<void> | null = null) {
  const calls: string[] = [];
  const api: SpotifyApiLike = {
    listPlaylists: async () => [],
    loadPlaylist: async () => [],
    play: async (device, track) => {
      calls.push(`play ${device} ${track}`);
      if (holdPlay) await holdPlay;
      calls.push(`played ${track}`);
      if (failPlay) throw new Error('Restriction violated');
    },
    resume: async (device) => {
      calls.push(`resume ${device}`);
    },
    pause: async (device) => {
      calls.push(`pause ${device}`);
      throw new Error('already paused');
    },
    transfer: async (device) => {
      calls.push(`transfer ${device}`);
    },
  };
  return { api, calls };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('SpotifyMusicSource', () => {
  it('gives up on a player that never becomes ready', async () => {
    vi.useFakeTimers();
    const p = fakePlayer();
    const src = new SpotifyMusicSource(fakeApi().api, async () => p.player, 10_000);
    const errors: PlaybackError[] = [];
    src.onError((e) => errors.push(e));
    await src.connect();
    const playing = src.play('t1');
    await vi.advanceTimersByTimeAsync(10_000);
    await playing;
    expect(errors).toEqual([{ trackId: 't1', message: 'Spotify player is not responding' }]);
  });

  it('hands playback to this tab when Spotify does not know the device yet, then plays', async () => {
    const p = fakePlayer();
    const { api, calls } = fakeApi();
    let first = true;
    api.play = async (device, track) => {
      calls.push(`play ${device} ${track}`);
      if (first) {
        first = false;
        throw new HttpError(404, 'Device not found');
      }
    };
    const src = new SpotifyMusicSource(api, async () => p.player);
    const errors: PlaybackError[] = [];
    src.onError((e) => errors.push(e));
    await src.connect();
    p.emit('ready', { device_id: 'dev1' });
    await src.play('t1');
    expect(calls).toEqual(['play dev1 t1', 'transfer dev1', 'play dev1 t1']);
    expect(errors).toEqual([]);
  });

  it('exposes its Connect device id once ready (to hide it from the room device list)', async () => {
    const p = fakePlayer();
    const src = new SpotifyMusicSource(fakeApi().api, async () => p.player);
    await src.connect();
    expect(src.deviceIdNow).toBeNull();
    p.emit('ready', { device_id: 'dev1' });
    expect(src.deviceIdNow).toBe('dev1');
  });

  it('waits for the device before playing', async () => {
    const p = fakePlayer();
    const { api, calls } = fakeApi();
    const src = new SpotifyMusicSource(api, async () => p.player);
    await src.connect();
    const playing = src.play('t1');
    expect(calls).toEqual([]);
    p.emit('ready', { device_id: 'dev1' });
    await playing;
    expect(calls).toEqual(['play dev1 t1', 'played t1']);
  });

  it('reports a missing Premium subscription', async () => {
    const p = fakePlayer();
    const src = new SpotifyMusicSource(fakeApi().api, async () => p.player);
    await src.connect();
    p.emit('account_error', { message: 'This functionality is restricted to premium users only' });
    await expect(src.ready()).rejects.toThrow(PREMIUM_REQUIRED);
  });

  it('fails when the player cannot connect', async () => {
    const src = new SpotifyMusicSource(fakeApi().api, async () => fakePlayer(false).player);
    await expect(src.connect()).rejects.toThrow('Could not connect the Spotify player');
  });

  it('turns play failures and SDK playback errors into onError, never throws', async () => {
    const p = fakePlayer();
    const src = new SpotifyMusicSource(fakeApi(true).api, async () => p.player);
    const errors: PlaybackError[] = [];
    src.onError((e) => errors.push(e));
    await src.connect();
    p.emit('ready', { device_id: 'dev1' });
    await src.play('t1');
    p.emit('playback_error', { message: 'Cannot play track' });
    expect(errors).toEqual([
      { trackId: 't1', message: 'Restriction violated' },
      { trackId: 't1', message: 'Cannot play track' },
    ]);
  });

  it('pauses on stop, swallowing errors, and ignores playback errors when stopped', async () => {
    const p = fakePlayer();
    const { api, calls } = fakeApi();
    const src = new SpotifyMusicSource(api, async () => p.player);
    const errors: PlaybackError[] = [];
    src.onError((e) => errors.push(e));
    await src.stop();
    await src.connect();
    p.emit('ready', { device_id: 'dev1' });
    await src.stop();
    p.emit('playback_error', { message: 'late' });
    expect(calls).toEqual(['pause dev1']);
    expect(errors).toEqual([]);
  });

  it('activates and disconnects the player', async () => {
    const p = fakePlayer();
    const src = new SpotifyMusicSource(fakeApi().api, async () => p.player);
    await src.connect();
    await src.activate();
    src.dispose();
    expect([p.activated(), p.disconnected()]).toEqual([1, 1]);
  });

  it('pauses and resumes the current track on the device', async () => {
    const p = fakePlayer();
    const { api, calls } = fakeApi();
    const src = new SpotifyMusicSource(api, async () => p.player);
    await src.connect();
    p.emit('ready', { device_id: 'dev1' });
    await src.resume();
    await src.play('t1');
    await src.pause();
    await src.resume();
    expect(calls).toEqual(['play dev1 t1', 'played t1', 'pause dev1', 'resume dev1']);
  });

  it('pause during an in-flight play pauses once play lands', async () => {
    const p = fakePlayer();
    let land: () => void = () => undefined;
    const hold = new Promise<void>((r) => {
      land = r;
    });
    const { api, calls } = fakeApi(false, hold);
    const src = new SpotifyMusicSource(api, async () => p.player);
    await src.connect();
    p.emit('ready', { device_id: 'dev1' });
    const playing = src.play('t1');
    await Promise.resolve();
    await src.pause();
    land();
    await playing;
    expect(calls.slice(-2)).toEqual(['played t1', 'pause dev1']);
  });

  it('stop forgets a pause so the next track plays normally', async () => {
    const p = fakePlayer();
    const { api, calls } = fakeApi();
    const src = new SpotifyMusicSource(api, async () => p.player);
    await src.connect();
    p.emit('ready', { device_id: 'dev1' });
    await src.play('t1');
    await src.pause();
    await src.stop();
    await src.play('t2');
    expect(calls.slice(-2)).toEqual(['play dev1 t2', 'played t2']);
  });
});
