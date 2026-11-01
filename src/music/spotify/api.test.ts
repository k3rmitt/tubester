import { describe, expect, it } from 'vitest';
import { HttpError, scriptedFetch } from '../../util/http';
import { SpotifyApi } from './api';

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
    const { api } = setup([{ status: 403, body: { error: { status: 403, message: 'User not registered in the Developer Dashboard' } } }]);
    await expect(api.me()).rejects.toThrow('User not registered in the Developer Dashboard');
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
