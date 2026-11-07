import { describe, expect, it } from 'vitest';
import { audioTrackFor, canStream, devicesFoundText, initialDevice, isLocalDevice, LOCAL_DEVICE, type DeviceEnv, defaultWhere, demoAllowed, effectiveSource, readDemoFlag, shouldAutoPause } from './musicMode';

const CHROME_MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0 Mobile/15E148 Safari/604.1';
const desktop: DeviceEnv = { hasDisplayMedia: true, userAgent: CHROME_MAC, maxTouchPoints: 0 };

function memorySession(): Storage {
  const m = new Map<string, string>();
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, v),
    removeItem: (k) => void m.delete(k),
    clear: () => m.clear(),
    key: () => null,
    get length() {
      return m.size;
    },
  };
}

const throwing = {
  getItem: () => {
    throw new Error('blocked');
  },
  setItem: () => {
    throw new Error('blocked');
  },
} as unknown as Storage;

describe('canStream / defaultWhere', () => {
  it('streams from desktop Chrome', () => {
    expect(canStream(desktop)).toBe(true);
    expect(defaultWhere(desktop, null)).toBe('stream');
  });

  it('plays in the room on phones, iPads posing as Macs and browsers without screen sharing', () => {
    expect(defaultWhere({ ...desktop, userAgent: IPHONE }, null)).toBe('room');
    expect(defaultWhere({ ...desktop, maxTouchPoints: 5 }, null)).toBe('room');
    expect(defaultWhere({ ...desktop, hasDisplayMedia: false }, null)).toBe('room');
    expect(defaultWhere({ ...desktop, uaMobile: true }, null)).toBe('room');
    expect(defaultWhere({ ...desktop, userAgent: 'Mozilla/5.0 (Linux; Android 14) Chrome/130.0 Mobile' }, null)).toBe('room');
  });

  it('keeps the host’s earlier choice', () => {
    expect(defaultWhere(desktop, 'room')).toBe('room');
    expect(defaultWhere({ ...desktop, userAgent: IPHONE }, 'stream')).toBe('stream');
    expect(defaultWhere(desktop, 'junk')).toBe('stream');
  });
});

describe('demo flag', () => {
  it('reads ?demo and remembers it for the tab', () => {
    const s = memorySession();
    expect(readDemoFlag('?demo', s)).toBe(true);
    expect(readDemoFlag('', s)).toBe(true);
    expect(readDemoFlag('?code=x', memorySession())).toBe(false);
  });

  it('works without storage', () => {
    expect(readDemoFlag('', null)).toBe(false);
    expect(readDemoFlag('?demo=1', throwing)).toBe(true);
    expect(readDemoFlag('', throwing)).toBe(false);
  });

  it('shows demo tones only with the flag or without Spotify', () => {
    expect(demoAllowed({ flag: false, spotifyAvailable: true })).toBe(false);
    expect(demoAllowed({ flag: true, spotifyAvailable: true })).toBe(true);
    expect(demoAllowed({ flag: false, spotifyAvailable: false })).toBe(true);
  });

  it('ignores a remembered demo choice unless demo is allowed', () => {
    expect(effectiveSource('demo', { flag: false, spotifyAvailable: true })).toBe('spotify');
    expect(effectiveSource('demo', { flag: true, spotifyAvailable: true })).toBe('demo');
    expect(effectiveSource(null, { flag: true, spotifyAvailable: true })).toBe('spotify');
    expect(effectiveSource(null, { flag: false, spotifyAvailable: false })).toBe('demo');
    expect(effectiveSource('spotify', { flag: false, spotifyAvailable: false })).toBe('demo');
  });
});

describe('shouldAutoPause', () => {
  const base = { hidden: true, inRoom: true, phase: 'deciding', paused: false };
  it('pauses a running room game when the host tab is hidden', () => {
    expect(shouldAutoPause(base)).toBe(true);
  });

  it('leaves everything else alone', () => {
    expect(shouldAutoPause({ ...base, hidden: false })).toBe(false);
    expect(shouldAutoPause({ ...base, inRoom: false })).toBe(false);
    expect(shouldAutoPause({ ...base, phase: null })).toBe(false);
    expect(shouldAutoPause({ ...base, phase: 'finished' })).toBe(false);
    expect(shouldAutoPause({ ...base, paused: true })).toBe(false);
  });
});

describe('audioTrackFor', () => {
  const feed = { id: 'feed' } as MediaStreamTrack;
  const capture = { id: 'capture' } as MediaStreamTrack;
  it('sends guests nothing when the music is in the room', () => {
    expect(audioTrackFor('room', 'spotify', { feed, capture })).toBeNull();
    expect(audioTrackFor('room', 'demo', { feed, capture })).toBeNull();
  });

  it('streams the tones or the captured tab otherwise', () => {
    expect(audioTrackFor('stream', 'demo', { feed, capture })).toBe(feed);
    expect(audioTrackFor('stream', 'spotify', { feed, capture })).toBe(capture);
    expect(audioTrackFor('stream', 'spotify', { feed, capture: null })).toBeNull();
  });
});

describe('This computer as the room device', () => {
  it('is picked by default on a desktop, never on a phone', () => {
    expect(initialDevice(null, true)).toEqual(LOCAL_DEVICE);
    expect(initialDevice(null, false)).toBeNull();
  });

  it('keeps the host’s earlier pick, but not This computer on a phone', () => {
    const kitchen = { id: 'd1', name: 'Kitchen' };
    expect(initialDevice(kitchen, true)).toEqual(kitchen);
    expect(initialDevice(kitchen, false)).toEqual(kitchen);
    expect(initialDevice(LOCAL_DEVICE, false)).toBeNull();
  });

  it('tells This computer apart from Connect devices', () => {
    expect(isLocalDevice(LOCAL_DEVICE)).toBe(true);
    expect(isLocalDevice({ id: 'd1', name: 'Kitchen' })).toBe(false);
    expect(isLocalDevice(null)).toBe(false);
  });
});

describe('devicesFoundText', () => {
  it('says how many devices the refresh found', () => {
    expect(devicesFoundText(0)).toBe('No devices found');
    expect(devicesFoundText(1)).toBe('Found 1 device');
    expect(devicesFoundText(3)).toBe('Found 3 devices');
  });
});
