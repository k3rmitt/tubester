import { describe, expect, it } from 'vitest';
import { seededRandom } from '../util/shuffle';
import { newRoomCode, peerIdFor } from './room';

describe('room codes', () => {
  it('look like TUBE-XXXX without ambiguous characters', () => {
    for (let i = 0; i < 200; i++) expect(newRoomCode()).toMatch(/^TUBE-[A-HJ-NP-Z2-9]{4}$/);
  });
  it('are deterministic for a given random source', () => {
    expect(newRoomCode(seededRandom(1))).toBe(newRoomCode(seededRandom(1)));
  });
  it('map to a namespaced PeerJS id', () => {
    expect(peerIdFor('TUBE-7KQ3')).toBe('tubester-tube-7kq3');
  });
});
