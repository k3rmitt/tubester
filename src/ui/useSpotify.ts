import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { type ReviewRow, toReviewRows } from '../host/review';
import { NEEDS_RELOGIN, SpotifyApi, type SpotifyDevice } from '../music/spotify/api';
import { NotLoggedInError, SESSION_EXPIRED, SpotifyAuth } from '../music/spotify/auth';
import { type ConnectDevice, SpotifyConnectSource } from '../music/spotify/connect';
import { createSpotifyPlayer } from '../music/spotify/sdk';
import { SpotifyMusicSource } from '../music/spotify/source';
import type { PlaylistSummary } from '../music/types';
import { browserFetch } from '../util/http';
import { idbYearCache } from '../years/cache';
import { createYearLookup } from '../years/lookup';
import { resolveYears } from '../years/resolve';

export const REVIEW_KEY = 'tubester.review';

function loadRows(): ReviewRow[] {
  try {
    const raw = localStorage.getItem(REVIEW_KEY);
    return raw ? (JSON.parse(raw) as ReviewRow[]) : [];
  } catch {
    return [];
  }
}

const messageOf = (e: unknown) => (e instanceof Error ? e.message : String(e));

export interface SpotifyState {
  available: boolean;
  loggedIn: boolean;
  playlists: PlaylistSummary[] | null;
  progress: { done: number; total: number } | null;
  rows: ReviewRow[];
  /** The in-tab player, only when the music is streamed to the phones. */
  source: SpotifyMusicSource | null;
  playerReady: boolean;
  /** Plays on the picked Connect device, for games in one room. */
  connectSource: SpotifyConnectSource | null;
  devices: SpotifyDevice[] | null;
  refreshDevices(): void;
  error: string | null;
  login(): void;
  logout(): void;
  importPlaylist(id: string): void;
  setRows(rows: ReviewRow[]): void;
}

export function useSpotify({ wantPlayer, device }: { wantPlayer: boolean; device: ConnectDevice | null }): SpotifyState {
  const deps = useMemo(() => {
    const clientId = import.meta.env.VITE_SPOTIFY_CLIENT_ID;
    if (!clientId) return null;
    const auth = new SpotifyAuth({
      clientId,
      redirectUri: `${window.location.origin}${window.location.pathname}`,
      storage: localStorage,
      fetchFn: browserFetch,
    });
    return { auth, api: new SpotifyApi(auth, browserFetch) };
  }, []);
  const [loggedIn, setLoggedIn] = useState(() => deps?.auth.isLoggedIn() ?? false);
  const [playlists, setPlaylists] = useState<PlaylistSummary[] | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [rows, setRowsState] = useState<ReviewRow[]>(loadRows);
  const [playerReady, setPlayerReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [devices, setDevices] = useState<SpotifyDevice[] | null>(null);
  const deviceRef = useRef(device);
  deviceRef.current = device;

  /** Any error; a revoked session also flips the UI back to "logged out". */
  const fail = useCallback((e: unknown) => {
    if (e instanceof NotLoggedInError) {
      setLoggedIn(false);
      setPlaylists(null);
    }
    setError(messageOf(e));
  }, []);

  const source = useMemo(
    () => (deps && loggedIn && wantPlayer ? new SpotifyMusicSource(deps.api, () => createSpotifyPlayer(deps.auth)) : null),
    [deps, loggedIn, wantPlayer],
  );

  const connectSource = useMemo(
    () => (deps && loggedIn ? new SpotifyConnectSource(deps.api, () => deviceRef.current) : null),
    [deps, loggedIn],
  );

  // A failed play may mean the login expired: flip the UI back to "logged out" so the host can log in again.
  useEffect(() => {
    connectSource?.onError(() => {
      if (deps && !deps.auth.isLoggedIn()) fail(new NotLoggedInError(SESSION_EXPIRED));
    });
  }, [connectSource, deps, fail]);

  const refreshDevices = useCallback(() => {
    if (!deps || !loggedIn) return;
    deps.api.devices().then((list) => {
      setDevices(list);
      // Only clear the device list's own message: a playlist error must stay visible.
      setError((e) => (e === NEEDS_RELOGIN ? null : e));
    }, fail);
  }, [deps, loggedIn, fail]);

  useEffect(() => {
    if (!deps || !window.location.search) return;
    deps.auth
      .completeLogin(window.location.search)
      .then(
        (handled) => {
          if (handled) setLoggedIn(true);
        },
        fail,
      )
      .finally(() => window.history.replaceState(null, '', `${window.location.pathname}#/host`));
  }, [deps, fail]);

  useEffect(() => {
    if (!deps || !loggedIn) return;
    deps.api.listPlaylists().then(setPlaylists, fail);
  }, [deps, loggedIn, fail]);

  useEffect(() => {
    if (!source) return;
    setPlayerReady(false);
    source.onError(() => {
      if (deps && !deps.auth.isLoggedIn()) fail(new NotLoggedInError(SESSION_EXPIRED));
    });
    source.connect().catch(fail);
    source.ready().then(() => setPlayerReady(true), fail);
    return () => source.dispose();
  }, [source, deps, fail]);

  const setRows = useCallback((next: ReviewRow[]) => {
    setRowsState(next);
    try {
      localStorage.setItem(REVIEW_KEY, JSON.stringify(next));
    } catch {
      // storage full: keep the review in memory only
    }
  }, []);

  const importPlaylist = useCallback(
    (id: string) => {
      if (!deps) return;
      setError(null);
      setProgress({ done: 0, total: 0 });
      deps.api
        .loadPlaylist(id)
        .then((tracks) =>
          resolveYears(tracks, {
            lookup: createYearLookup(browserFetch),
            cache: idbYearCache(),
            onProgress: (done, total) => setProgress({ done, total }),
          }),
        )
        .then((resolved) => setRows(toReviewRows(resolved)))
        .catch(fail)
        .finally(() => setProgress(null));
    },
    [deps, setRows, fail],
  );

  const login = useCallback(() => {
    deps?.auth.beginLogin().then((url) => window.location.assign(url), fail);
  }, [deps, fail]);

  const logout = useCallback(() => {
    deps?.auth.logout();
    setLoggedIn(false);
    setPlaylists(null);
    setDevices(null);
    setError(null);
  }, [deps]);

  return {
    available: deps !== null,
    loggedIn,
    playlists,
    progress,
    rows,
    source,
    playerReady,
    connectSource,
    devices,
    refreshDevices,
    error,
    login,
    logout,
    importPlaylist,
    setRows,
  };
}
