import { describe, expect, it } from 'vitest';
import { splashMode } from './splashMode';

const home = { name: 'home' } as const;
const host = { name: 'host' } as const;
const base = { search: '', hasSavedGame: false, reducedMotion: false };

describe('splashMode', () => {
  it('plays in full on home and join links', () => {
    expect(splashMode({ ...base, route: home })).toBe('full');
    expect(splashMode({ ...base, route: { name: 'join', code: 'TUBE-AB12' } })).toBe('full');
  });

  it('is skipped on the return from Spotify login', () => {
    expect(splashMode({ ...base, route: host, search: '?code=x&state=y' })).toBe('none');
  });

  it('is skipped when the host reloads into a saved game', () => {
    expect(splashMode({ ...base, route: host, hasSavedGame: true })).toBe('none');
  });

  it('still plays for a guest even if this browser holds a saved host game', () => {
    expect(splashMode({ ...base, route: home, hasSavedGame: true })).toBe('full');
  });

  it('shows a still frame with reduced motion', () => {
    expect(splashMode({ ...base, route: home, reducedMotion: true })).toBe('still');
  });
});
