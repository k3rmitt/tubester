import type { Lobby } from '../host/lobby';
import type { GameView } from '../host/view';

export type AudioState = 'countdown' | 'playing' | 'paused' | 'stopped';

export type GuestToHost =
  | { t: 'hello'; playerId: string; secret: string; name: string }
  | { t: 'intent'; intent: unknown };

export type HostToGuest =
  | { t: 'lobby'; lobby: Lobby }
  | { t: 'state'; view: GameView; lobby: Lobby; audio: AudioState; stealWindowMs: number }
  | { t: 'rejected'; reason: string };

export const MAX_NAME_LENGTH = 24;
const MAX_ID_LENGTH = 64;

const isId = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= MAX_ID_LENGTH;

/** Guests are untrusted: only well-formed messages get through. Intents are validated later by HostRuntime. */
export function parseGuestMessage(raw: unknown): GuestToHost | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (r.t === 'hello') {
    if (!isId(r.playerId) || !isId(r.secret) || typeof r.name !== 'string') return null;
    const name = r.name.trim().slice(0, MAX_NAME_LENGTH);
    if (!name) return null;
    return { t: 'hello', playerId: r.playerId, secret: r.secret, name };
  }
  if (r.t === 'intent') return { t: 'intent', intent: r.intent };
  return null;
}
