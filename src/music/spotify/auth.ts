import { type HttpFetch, HttpError } from '../../util/http';
import type { KeyValueStorage } from '../../util/storage';
import { authorizeUrl, challengeFor, randomString } from './pkce';

export const TOKENS_KEY = 'tubester.spotify.tokens';
export const PKCE_KEY = 'tubester.spotify.pkce';
const TOKEN_URL = 'https://accounts.spotify.com/api/token';
const EARLY_REFRESH_MS = 60_000;

export interface Tokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

export class NotLoggedInError extends Error {
  constructor() {
    super('Not logged in to Spotify');
  }
}

export interface SpotifyAuthDeps {
  clientId: string;
  redirectUri: string;
  storage: KeyValueStorage;
  fetchFn: HttpFetch;
  now?: () => number;
  random?: (a: Uint8Array<ArrayBuffer>) => Uint8Array;
}

/** Authorization Code with PKCE: no client secret, tokens kept in localStorage. */
export class SpotifyAuth {
  private refreshing: Promise<string> | null = null;

  constructor(private readonly deps: SpotifyAuthDeps) {}

  isLoggedIn(): boolean {
    return this.tokens() !== null;
  }

  async beginLogin(): Promise<string> {
    const verifier = randomString(64, this.deps.random);
    const state = randomString(16, this.deps.random);
    this.deps.storage.setItem(PKCE_KEY, JSON.stringify({ verifier, state }));
    return authorizeUrl({
      clientId: this.deps.clientId,
      redirectUri: this.deps.redirectUri,
      challenge: await challengeFor(verifier),
      state,
    });
  }

  /** Handles Spotify's redirect (`?code=…&state=…`). Returns false when the URL is not a login callback. */
  async completeLogin(search: string): Promise<boolean> {
    const q = new URLSearchParams(search);
    const state = q.get('state');
    if (!state) return false;
    const raw = this.deps.storage.getItem(PKCE_KEY);
    this.deps.storage.removeItem(PKCE_KEY);
    const error = q.get('error');
    if (error) throw new Error(error === 'access_denied' ? 'Spotify login was cancelled' : `Spotify login failed: ${error}`);
    const pending = raw ? (JSON.parse(raw) as { verifier?: string; state?: string }) : null;
    const code = q.get('code');
    if (!pending?.verifier || pending.state !== state || !code) throw new Error('Spotify login expired, please try again');
    const body = await this.post({
      grant_type: 'authorization_code',
      code,
      redirect_uri: this.deps.redirectUri,
      client_id: this.deps.clientId,
      code_verifier: pending.verifier,
    });
    this.save(this.parse(body, null));
    return true;
  }

  async accessToken(): Promise<string> {
    const t = this.tokens();
    if (!t) throw new NotLoggedInError();
    if (t.expiresAt - EARLY_REFRESH_MS > this.now()) return t.accessToken;
    return this.forceRefresh();
  }

  forceRefresh(): Promise<string> {
    this.refreshing ??= this.refresh().finally(() => {
      this.refreshing = null;
    });
    return this.refreshing;
  }

  logout(): void {
    this.deps.storage.removeItem(TOKENS_KEY);
  }

  private async refresh(): Promise<string> {
    const t = this.tokens();
    if (!t) throw new NotLoggedInError();
    let body: unknown;
    try {
      body = await this.post({ grant_type: 'refresh_token', refresh_token: t.refreshToken, client_id: this.deps.clientId });
    } catch (e) {
      if (e instanceof HttpError && (e.status === 400 || e.status === 401)) this.logout();
      throw e;
    }
    const next = this.parse(body, t.refreshToken);
    this.save(next);
    return next.accessToken;
  }

  private async post(params: Record<string, string>): Promise<unknown> {
    const res = await this.deps.fetchFn(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(params).toString(),
    });
    if (!res.ok) throw new HttpError(res.status, `Spotify token request failed (${res.status})`);
    return res.json();
  }

  private parse(body: unknown, previousRefresh: string | null): Tokens {
    const b = (body ?? {}) as { access_token?: unknown; refresh_token?: unknown; expires_in?: unknown };
    if (typeof b.access_token !== 'string') throw new Error('Spotify returned no access token');
    const refreshToken = typeof b.refresh_token === 'string' ? b.refresh_token : previousRefresh;
    if (!refreshToken) throw new Error('Spotify returned no refresh token');
    const expiresIn = typeof b.expires_in === 'number' ? b.expires_in : 3600;
    return { accessToken: b.access_token, refreshToken, expiresAt: this.now() + expiresIn * 1000 };
  }

  private tokens(): Tokens | null {
    try {
      const t = JSON.parse(this.deps.storage.getItem(TOKENS_KEY) ?? 'null') as Partial<Tokens> | null;
      if (t && typeof t.accessToken === 'string' && typeof t.refreshToken === 'string' && typeof t.expiresAt === 'number') {
        return t as Tokens;
      }
    } catch {
      // corrupt: treat as logged out
    }
    return null;
  }

  private save(t: Tokens): void {
    this.deps.storage.setItem(TOKENS_KEY, JSON.stringify(t));
  }

  private now(): number {
    return (this.deps.now ?? Date.now)();
  }
}
