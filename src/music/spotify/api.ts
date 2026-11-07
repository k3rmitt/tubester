import { type HttpFetch, HttpError } from '../../util/http';
import type { PlaylistSummary, Track } from '../types';

const BASE = 'https://api.spotify.com/v1';

export interface TokenSource {
  accessToken(): Promise<string>;
  forceRefresh(): Promise<string>;
}

interface Page<T> {
  items?: T[];
  next?: string | null;
}

interface ApiPlaylist {
  id?: string;
  name?: string;
  collaborative?: boolean;
  owner?: { id?: string };
  items?: { total?: number };
  tracks?: { total?: number };
}

interface ApiTrack {
  type?: string;
  id?: string | null;
  name?: string;
  is_local?: boolean;
  artists?: { name?: string }[];
  album?: { release_date?: string; images?: { url?: string; width?: number | null }[] };
  external_ids?: { isrc?: string };
}

/** The smallest image at least 300 px wide, else the largest one. */
export function pickCover(images: { url?: string; width?: number | null }[] | undefined): string | undefined {
  const usable = (images ?? []).filter((i): i is { url: string; width?: number | null } => typeof i.url === 'string' && i.url !== '');
  if (usable.length === 0) return undefined;
  const width = (i: { width?: number | null }) => i.width ?? 0;
  const big = usable.filter((i) => width(i) >= 300).sort((a, b) => width(a) - width(b));
  return (big[0] ?? usable.sort((a, b) => width(b) - width(a))[0]).url;
}

export const NEEDS_RELOGIN = 'Log in to Spotify again to see your devices';
/** Spotify refuses the logged-in account (development mode: not on the app's allowlist, or no Premium). */
export class AccountRefusedError extends Error {
  constructor(spotifyMessage: string) {
    super(
      `Spotify refused this account (${spotifyMessage}). Log out and log in with the account the TUBESTER owner added, or ask them to add this one.`,
    );
  }
}

export interface SpotifyDevice {
  id: string;
  name: string;
  type: string;
  isActive: boolean;
}

interface ApiDevice {
  id?: string | null;
  name?: string;
  type?: string;
  is_active?: boolean;
  is_restricted?: boolean;
}

const is403 = (e: unknown) => e instanceof HttpError && e.status === 403;

export class SpotifyApi {
  constructor(
    private readonly auth: TokenSource,
    private readonly fetchFn: HttpFetch,
  ) {}

  async me(): Promise<{ id: string }> {
    const body = (await this.request('GET', '/me').catch((e) => {
      // Development mode: accounts not on the app's allowlist get 403.
      throw is403(e) ? new AccountRefusedError((e as Error).message) : e;
    })) as { id?: string } | null;
    if (!body?.id) throw new Error('Spotify returned no user id');
    return { id: body.id };
  }

  /** Only playlists whose contents the API will return: owned or collaborative. */
  async listPlaylists(): Promise<PlaylistSummary[]> {
    const { id: me } = await this.me();
    const out: PlaylistSummary[] = [];
    for await (const p of this.pages<ApiPlaylist>('/me/playlists?limit=50')) {
      if (!p.id || !p.name) continue;
      if (p.owner?.id !== me && !p.collaborative) continue;
      out.push({ id: p.id, name: p.name, trackCount: p.items?.total ?? p.tracks?.total ?? 0 });
    }
    return out;
  }

  async loadPlaylist(id: string): Promise<Track[]> {
    const out: Track[] = [];
    const seen = new Set<string>();
    const path = `/playlists/${encodeURIComponent(id)}/items?limit=100&additional_types=track`;
    for await (const entry of this.pages<{ item?: ApiTrack | null; track?: ApiTrack | null }>(path)) {
      const t = entry.item ?? entry.track;
      if (t?.type !== 'track' || t.is_local || !t.id || !t.name || seen.has(t.id)) continue;
      const year = Number.parseInt((t.album?.release_date ?? '').slice(0, 4), 10);
      if (!Number.isFinite(year) || year < 1900) continue;
      seen.add(t.id);
      out.push({
        id: t.id,
        title: t.name,
        artists: (t.artists ?? []).map((a) => a.name ?? '').filter(Boolean),
        isrc: t.external_ids?.isrc,
        sourceYear: year,
        cover: pickCover(t.album?.images),
      });
    }
    return out;
  }

  /** Spotify Connect devices of this account that TUBESTER can control. */
  async devices(): Promise<SpotifyDevice[]> {
    const body = (await this.request('GET', '/me/player/devices').catch((e) => {
      // Logins from before the device permission was added get 401 "Permissions missing" (or 403),
      // even after a token refresh: only a new login grants the permission.
      const denied = e instanceof HttpError && (e.status === 401 || e.status === 403);
      throw denied ? new Error(NEEDS_RELOGIN) : e;
    })) as { devices?: ApiDevice[] } | null;
    const out: SpotifyDevice[] = [];
    for (const d of body?.devices ?? []) {
      if (!d.id || d.is_restricted) continue;
      out.push({ id: d.id, name: d.name ?? 'Spotify device', type: d.type ?? '', isActive: d.is_active === true });
    }
    return out;
  }

  /** Makes the device the active one (wakes an idle device) without starting playback. */
  async transfer(deviceId: string): Promise<void> {
    await this.request('PUT', '/me/player', { device_ids: [deviceId], play: false });
  }

  async play(deviceId: string, trackId: string): Promise<void> {
    await this.request('PUT', `/me/player/play?device_id=${encodeURIComponent(deviceId)}`, {
      uris: [`spotify:track:${trackId}`],
    });
  }

  /** Resumes the device's current track at its position (play without a body). */
  async resume(deviceId: string): Promise<void> {
    await this.request('PUT', `/me/player/play?device_id=${encodeURIComponent(deviceId)}`);
  }

  async pause(deviceId: string): Promise<void> {
    await this.request('PUT', `/me/player/pause?device_id=${encodeURIComponent(deviceId)}`);
  }

  private async *pages<T>(first: string): AsyncGenerator<T> {
    let next: string | null | undefined = first;
    while (next) {
      const page = (await this.request('GET', next)) as Page<T> | null;
      for (const item of page?.items ?? []) yield item;
      next = page?.next;
    }
  }

  private async request(method: string, path: string, body?: unknown, retried = false): Promise<unknown> {
    const token = retried ? await this.auth.forceRefresh() : await this.auth.accessToken();
    const res = await this.fetchFn(path.startsWith('http') ? path : `${BASE}${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (res.status === 401 && !retried) return this.request(method, path, body, true);
    if (res.status === 204) return null;
    if (!res.ok) {
      const detail = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
      throw new HttpError(res.status, detail?.error?.message ?? `Spotify request failed (${res.status})`);
    }
    return res.json().catch(() => null);
  }
}
