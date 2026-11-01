import type { SdkPlayer } from './source';

interface SpotifyNamespace {
  Player: new (options: {
    name: string;
    getOAuthToken: (cb: (token: string) => void) => void;
    volume?: number;
  }) => SdkPlayer;
}

declare global {
  interface Window {
    Spotify?: SpotifyNamespace;
    onSpotifyWebPlaybackSDKReady?: () => void;
  }
}

let loading: Promise<SpotifyNamespace> | null = null;

export function loadSpotifySdk(): Promise<SpotifyNamespace> {
  loading ??= new Promise((resolve, reject) => {
    if (window.Spotify) {
      resolve(window.Spotify);
      return;
    }
    window.onSpotifyWebPlaybackSDKReady = () => {
      if (window.Spotify) resolve(window.Spotify);
      else reject(new Error('Spotify player failed to load'));
    };
    const script = document.createElement('script');
    script.src = 'https://sdk.scdn.co/spotify-player.js';
    script.async = true;
    script.onerror = () => reject(new Error('Spotify player failed to load'));
    document.body.appendChild(script);
  });
  return loading;
}

export async function createSpotifyPlayer(auth: { accessToken(): Promise<string> }): Promise<SdkPlayer> {
  const Spotify = await loadSpotifySdk();
  return new Spotify.Player({
    name: 'TUBESTER',
    getOAuthToken: (cb) => {
      auth.accessToken().then(cb, () => undefined);
    },
    volume: 0.8,
  });
}
