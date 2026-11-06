/** Where the players hear the music: out loud in one room, or streamed to each phone. */
export type Where = 'room' | 'stream';
export type Source = 'demo' | 'spotify';

export const WHERE_KEY = 'tubester.where';
export const DEVICE_KEY = 'tubester.device';
const DEMO_KEY = 'tubester.demo';

export interface DeviceEnv {
  hasDisplayMedia: boolean;
  uaMobile?: boolean;
  userAgent: string;
  maxTouchPoints: number;
}

export function browserEnv(): DeviceEnv {
  const nav = navigator as Navigator & { userAgentData?: { mobile?: boolean } };
  return {
    hasDisplayMedia: typeof nav.mediaDevices?.getDisplayMedia === 'function',
    uaMobile: nav.userAgentData?.mobile,
    userAgent: nav.userAgent,
    maxTouchPoints: nav.maxTouchPoints ?? 0,
  };
}

/** Can this browser share a tab with its sound? Phones and tablets can't. */
export function canStream(env: DeviceEnv): boolean {
  if (!env.hasDisplayMedia || env.uaMobile) return false;
  if (/iPhone|iPad|iPod|Android/.test(env.userAgent)) return false;
  // iPads ask for the desktop site and report a Mac user agent; Macs have no touch screen.
  if (/Macintosh/.test(env.userAgent) && env.maxTouchPoints > 1) return false;
  return true;
}

export function defaultWhere(env: DeviceEnv, stored: string | null): Where {
  if (stored === 'room' || stored === 'stream') return stored;
  return canStream(env) ? 'stream' : 'room';
}

/** The `demo` URL flag shows demo tones; it is kept for the tab because the URL gets cleaned up after load. */
export function readDemoFlag(search: string, session: Storage | null): boolean {
  if (new URLSearchParams(search).has('demo')) {
    try {
      session?.setItem(DEMO_KEY, '1');
    } catch {
      // storage blocked: the flag lasts until the URL changes
    }
    return true;
  }
  try {
    return session?.getItem(DEMO_KEY) === '1';
  } catch {
    return false;
  }
}

export function demoAllowed(opts: { flag: boolean; spotifyAvailable: boolean }): boolean {
  return opts.flag || !opts.spotifyAvailable;
}

export function effectiveSource(stored: string | null, opts: { flag: boolean; spotifyAvailable: boolean }): Source {
  if (!opts.spotifyAvailable) return 'demo';
  return stored === 'demo' && demoAllowed(opts) ? 'demo' : 'spotify';
}

/** A room game pauses itself when the host's tab goes to the background (app switch, screen lock). */
export function shouldAutoPause(s: { hidden: boolean; inRoom: boolean; phase: string | null; paused: boolean }): boolean {
  return s.hidden && s.inRoom && s.phase !== null && s.phase !== 'finished' && !s.paused;
}

/** The sound sent to guests: nothing when the music plays in the room. */
export function audioTrackFor(
  where: Where,
  source: Source,
  tracks: { feed: MediaStreamTrack | null; capture: MediaStreamTrack | null },
): MediaStreamTrack | null {
  if (where === 'room') return null;
  return source === 'demo' ? tracks.feed : tracks.capture;
}

let demoFlagCache: boolean | null = null;

/** Read once at startup (main.tsx), before the Spotify login code rewrites the URL. */
export function demoFlag(): boolean {
  if (demoFlagCache === null) {
    let session: Storage | null = null;
    try {
      session = window.sessionStorage;
    } catch {
      // storage blocked
    }
    demoFlagCache = readDemoFlag(window.location.search, session);
  }
  return demoFlagCache;
}
