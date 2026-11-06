import { describe, expect, it } from 'vitest';
import { HttpError, scriptedFetch } from '../../util/http';
import { pickCover, SpotifyApi } from './api';

function setup(responses: { status: number; body?: unknown }[]) {
  const { fetchFn, calls } = scriptedFetch(responses);
  let token = 'tok';
  let refreshes = 0;
  const auth = {
    accessToken: async () => token,
    forceRefresh: async () => {
      refreshes++;
      token = 'tok2';
      return token;
    },
  };
  return { api: new SpotifyApi(auth, fetchFn), calls, refreshes: () => refreshes };
}

const track = (id: string, name: string, date: string, extra: Record<string, unknown> = {}) => ({
  type: 'track',
  id,
  name,
  artists: [{ name: 'Artist' }],
  album: { release_date: date },
  external_ids: { isrc: `ISRC${id}` },
  is_local: false,
  ...extra,
});

describe('SpotifyApi.listPlaylists', () => {
  it('lists only playlists the user owns or collaborates on, across pages', async () => {
    const { api, calls } = setup([
      { status: 200, body: { id: 'me' } },
      {
        status: 200,
        body: {
          items: [
            { id: 'p1', name: 'Mine', owner: { id: 'me' }, collaborative: false, items: { total: 12 } },
            { id: 'p2', name: 'Followed', owner: { id: 'spotify' }, collaborative: false, items: { total: 50 } },
          ],
          next: 'https://api.spotify.com/v1/me/playlists?offset=50&limit=50',
        },
      },
      { status: 200, body: { items: [{ id: 'p3', name: 'Shared', owner: { id: 'x' }, collaborative: true, tracks: { total: 3 } }], next: null } },
    ]);
    expect(await api.listPlaylists()).toEqual([
      { id: 'p1', name: 'Mine', trackCount: 12 },
      { id: 'p3', name: 'Shared', trackCount: 3 },
    ]);
    expect(calls.map((c) => c.url)).toEqual([
      'https://api.spotify.com/v1/me',
      'https://api.spotify.com/v1/me/playlists?limit=50',
      'https://api.spotify.com/v1/me/playlists?offset=50&limit=50',
    ]);
    expect(calls[0].init?.headers?.Authorization).toBe('Bearer tok');
  });
});

describe('SpotifyApi.loadPlaylist', () => {
  it('maps playlist items to tracks, skipping what cannot be played or dated', async () => {
    const { api, calls } = setup([
      {
        status: 200,
        body: {
          items: [
            { item: track('t1', 'Bohemian Rhapsody', '1975-10-31') },
            { item: track('t2', 'Local', '2001', { is_local: true }) },
            { item: { type: 'episode', id: 'e1', name: 'Podcast' } },
            { item: track('t3', 'No date', '0000') },
            { item: null },
            { track: track('t4', 'Legacy shape', '1991') },
          ],
          next: 'https://api.spotify.com/v1/playlists/p1/items?offset=100&limit=100',
        },
      },
      { status: 200, body: { items: [{ item: track('t1', 'Bohemian Rhapsody', '1975-10-31') }, { item: track('t5', 'No ISRC', '2003', { external_ids: {} }) }], next: null } },
    ]);
    expect(await api.loadPlaylist('p1')).toEqual([
      { id: 't1', title: 'Bohemian Rhapsody', artists: ['Artist'], isrc: 'ISRCt1', sourceYear: 1975 },
      { id: 't4', title: 'Legacy shape', artists: ['Artist'], isrc: 'ISRCt4', sourceYear: 1991 },
      { id: 't5', title: 'No ISRC', artists: ['Artist'], isrc: undefined, sourceYear: 2003 },
    ]);
    expect(calls[0].url).toBe('https://api.spotify.com/v1/playlists/p1/items?limit=100&additional_types=track');
  });
});

describe('album covers', () => {
  it('picks the smallest cover of at least 300 px, else the largest', () => {
    expect(pickCover([{ url: 'a', width: 640 }, { url: 'b', width: 300 }, { url: 'c', width: 64 }])).toBe('b');
    expect(pickCover([{ url: 'c', width: 64 }, { url: 'd', width: 200 }])).toBe('d');
    expect(pickCover([{ width: 640 }, { url: 'e', width: null }])).toBe('e');
    expect(pickCover([])).toBeUndefined();
    expect(pickCover(undefined)).toBeUndefined();
  });

  it('loads the album cover with each track', async () => {
    const images = [
      { url: 'u640', width: 640, height: 640 },
      { url: 'u300', width: 300, height: 300 },
    ];
    const { api } = setup([
      {
        status: 200,
        body: {
          items: [
            { item: track('t1', 'With cover', '1975', { album: { release_date: '1975', images } }) },
            { item: track('t2', 'No cover', '1980') },
          ],
          next: null,
        },
      },
    ]);
    const tracks = await api.loadPlaylist('p1');
    expect(tracks[0].cover).toBe('u300');
    expect(tracks[1].cover).toBeUndefined();
  });
});

describe('SpotifyApi.resume', () => {
  it('resumes the device without a body (keeps the position)', async () => {
    const { api, calls } = setup([{ status: 204 }]);
    await api.resume('dev');
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('https://api.spotify.com/v1/me/player/play?device_id=dev');
    expect(calls[0].init?.method).toBe('PUT');
    expect(calls[0].init?.body).toBeUndefined();
  });
});

describe('SpotifyApi requests', () => {
  it('refreshes once on a 401 and retries', async () => {
    const { api, calls, refreshes } = setup([{ status: 401 }, { status: 200, body: { id: 'me' } }]);
    expect(await api.me()).toEqual({ id: 'me' });
    expect(refreshes()).toBe(1);
    expect(calls[1].init?.headers?.Authorization).toBe('Bearer tok2');
  });

  it('gives up after a second 401', async () => {
    const { api } = setup([{ status: 401 }, { status: 401 }]);
    await expect(api.me()).rejects.toBeInstanceOf(HttpError);
  });

  it("surfaces Spotify's error message", async () => {
    const { api } = setup([{ status: 403, body: { error: { status: 403, message: 'Player command failed: Restriction violated' } } }]);
    await expect(api.pause('d1')).rejects.toThrow('Player command failed: Restriction violated');
  });

  it('starts a track on a device and pauses it', async () => {
    const { api, calls } = setup([{ status: 204 }, { status: 204 }]);
    await api.play('dev 1', 't1');
    await api.pause('dev 1');
    expect(calls[0]).toMatchObject({
      url: 'https://api.spotify.com/v1/me/player/play?device_id=dev%201',
      init: { method: 'PUT', body: JSON.stringify({ uris: ['spotify:track:t1'] }) },
    });
    expect(calls[1]).toMatchObject({ url: 'https://api.spotify.com/v1/me/player/pause?device_id=dev%201', init: { method: 'PUT' } });
  });
});

describe('SpotifyApi Connect devices', () => {
  it('lists usable devices only', async () => {
    const { api, calls } = setup([
      {
        status: 200,
        body: {
          devices: [
            { id: 'd1', name: 'Kitchen', type: 'Speaker', is_active: false },
            { id: null, name: 'Ghost', type: 'Speaker' },
            { id: 'r', name: 'Restricted', type: 'TV', is_restricted: true },
          ],
        },
      },
    ]);
    expect(await api.devices()).toEqual([{ id: 'd1', name: 'Kitchen', type: 'Speaker', isActive: false }]);
    expect(calls[0].url).toBe('https://api.spotify.com/v1/me/player/devices');
  });

  it('asks for a new login when Spotify answers 401 Permissions missing (even after a token refresh)', async () => {
    const { api } = setup([
      { status: 401, body: { error: { message: 'Permissions missing' } } },
      { status: 401, body: { error: { message: 'Permissions missing' } } },
    ]);
    await expect(api.devices()).rejects.toThrow('Log in to Spotify again to see your devices');
  });

  it('asks for a new login when the device permission is missing', async () => {
    const { api } = setup([{ status: 403, body: { error: { message: 'Insufficient client scope' } } }]);
    await expect(api.devices()).rejects.toThrow('Log in to Spotify again to see your devices');
  });

  it('transfers playback to a device without starting it', async () => {
    const { api, calls } = setup([{ status: 204 }]);
    await api.transfer('d1');
    expect(calls[0].url).toBe('https://api.spotify.com/v1/me/player');
    expect(calls[0].init?.method).toBe('PUT');
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({ device_ids: ['d1'], play: false });
  });

  it('explains when the account is not allowed to use the app', async () => {
    const { api } = setup([{ status: 403, body: { error: { message: 'User not registered in the Developer Dashboard' } } }]);
    await expect(api.listPlaylists()).rejects.toThrow("This Spotify account can't host yet. Ask the TUBESTER owner to add it.");
  });
});
