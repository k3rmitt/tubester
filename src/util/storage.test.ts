import { describe, expect, it } from 'vitest';
import { memoryStorage } from './storage';

describe('memoryStorage', () => {
  it('stores, reads and removes strings', () => {
    const s = memoryStorage();
    expect(s.getItem('k')).toBeNull();
    s.setItem('k', 'v');
    expect(s.getItem('k')).toBe('v');
    s.removeItem('k');
    expect(s.getItem('k')).toBeNull();
  });
});
