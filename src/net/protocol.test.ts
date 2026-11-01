import { describe, expect, it } from 'vitest';
import { parseGuestMessage } from './protocol';

describe('parseGuestMessage', () => {
  it('accepts a hello and trims the name to 24 chars', () => {
    expect(parseGuestMessage({ t: 'hello', playerId: 'p1', secret: 's1', name: `  ${'x'.repeat(30)} ` })).toEqual({
      t: 'hello',
      playerId: 'p1',
      secret: 's1',
      name: 'x'.repeat(24),
    });
  });
  it('passes intents through untouched (the runtime validates them)', () => {
    expect(parseGuestMessage({ t: 'intent', intent: { type: 'skip' } })).toEqual({ t: 'intent', intent: { type: 'skip' } });
  });
  it.each([
    ['null', null],
    ['string', 'hello'],
    ['unknown tag', { t: 'admin' }],
    ['blank name', { t: 'hello', playerId: 'p1', secret: 's1', name: '   ' }],
    ['missing secret', { t: 'hello', playerId: 'p1', name: 'Léa' }],
    ['numeric id', { t: 'hello', playerId: 5, secret: 's1', name: 'Léa' }],
    ['huge id', { t: 'hello', playerId: 'p'.repeat(65), secret: 's1', name: 'Léa' }],
  ])('rejects %s', (_label, raw) => {
    expect(parseGuestMessage(raw)).toBeNull();
  });
});
