import { useCallback, useEffect, useMemo, useState } from 'react';
import { type ReviewRow, toReviewRows } from '../host/review';
import { SpotifyApi } from '../music/spotify/api';
import { SpotifyAuth } from '../music/spotify/auth';
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
  source: SpotifyMusicSource | null;
  playerReady: boolean;
  error: string | null;
  login(): void;
  logout(): void;
  importPlaylist(id: string): void;
  setRows(rows: ReviewRow[]): void;
}

export function useSpotify(): SpotifyState {
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

  const source = useMemo(
    () => (deps && loggedIn ? new SpotifyMusicSource(deps.api, () => createSpotifyPlayer(deps.auth)) : null),
    [deps, loggedIn],
  );

  useEffect(() => {
    if (!deps || !window.location.search) return;
    deps.auth
      .completeLogin(window.location.search)
      .then(
        (handled) => {
          if (handled) setLoggedIn(true);
        },
        (e) => setError(messageOf(e)),
      )
      .finally(() => window.history.replaceState(null, '', `${window.location.pathname}#/host`));
  }, [deps]);

  useEffect(() => {
    if (!deps || !loggedIn) return;
    deps.api.listPlaylists().then(setPlaylists, (e) => setError(messageOf(e)));
  }, [deps, loggedIn]);

  useEffect(() => {
    if (!source) return;
    setPlayerReady(false);
    source.connect().catch((e) => setError(messageOf(e)));
    source.ready().then(
      () => setPlayerReady(true),
      (e) => setError(messageOf(e)),
    );
    return () => source.dispose();
  }, [source]);

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
        .catch((e) => setError(messageOf(e)))
        .finally(() => setProgress(null));
    },
    [deps, setRows],
  );

  const login = useCallback(() => {
    deps?.auth.beginLogin().then(
      (url) => window.location.assign(url),
      (e) => setError(messageOf(e)),
    );
  }, [deps]);

  const logout = useCallback(() => {
    deps?.auth.logout();
    setLoggedIn(false);
    setPlaylists(null);
  }, [deps]);

  return {
    available: deps !== null,
    loggedIn,
    playlists,
    progress,
    rows,
    source,
    playerReady,
    error,
    login,
    logout,
    importPlaylist,
    setRows,
  };
}
