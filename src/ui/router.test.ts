import { describe, expect, it } from 'vitest';
import { parseRoute } from './router';

describe('parseRoute', () => {
  it.each([
    ['', { name: 'home' }],
    ['#/', { name: 'home' }],
    ['#/host', { name: 'host' }],
    ['#/join/TUBE-7KQ3', { name: 'join', code: 'TUBE-7KQ3' }],
    ['#/join/tube-7kq3', { name: 'join', code: 'TUBE-7KQ3' }],
    ['#/join/<script>', { name: 'home' }],
  ])('%s', (hash, route) => {
    expect(parseRoute(hash)).toEqual(route);
  });
});
describe('parseRoute after the Spotify redirect', () => {
  it('sends the login callback to the host screen', () => {
    expect(parseRoute('', '?code=abc&state=xyz')).toEqual({ name: 'host' });
    expect(parseRoute('', '?error=access_denied&state=xyz')).toEqual({ name: 'host' });
    expect(parseRoute('', '?utm=1')).toEqual({ name: 'home' });
  });
});

