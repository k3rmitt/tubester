const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function newRoomCode(random: () => number = Math.random): string {
  let s = '';
  for (let i = 0; i < 4; i++) s += ALPHABET[Math.floor(random() * ALPHABET.length)];
  return `TUBE-${s}`;
}

/** PeerJS ids are global on the public broker, so namespace them. */
export function peerIdFor(code: string): string {
  return `tubester-${code.toLowerCase()}`;
}
