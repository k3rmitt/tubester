import type { Route } from './router';

export type SplashMode = 'full' | 'still' | 'none';

/** How long each mode stays before moving on (a tap skips it). */
export const SPLASH_MS = { full: 5000, still: 1500 } as const;

/** Every app open gets the splash, except the Spotify login return and a host reloading into a game. */
export function splashMode(input: { route: Route; search: string; hasSavedGame: boolean; reducedMotion: boolean }): SplashMode {
  if (new URLSearchParams(input.search).has('state')) return 'none';
  if (input.route.name === 'host' && input.hasSavedGame) return 'none';
  return input.reducedMotion ? 'still' : 'full';
}
