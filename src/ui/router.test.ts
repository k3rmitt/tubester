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
