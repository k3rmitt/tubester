import { describe, expect, it } from 'vitest';
import { scriptedFetch } from '../../util/http';
import { memoryStorage } from '../../util/storage';
import { NotLoggedInError, PKCE_KEY, SpotifyAuth, TOKENS_KEY } from './auth';
import { challengeFor } from './pkce';

const REDIRECT = 'https://k3rmitt.github.io/tubester/';

function setup(responses: { status: number; body?: unknown }[] = [], start = 1_000_000) {
  const storage = memoryStorage();
  const { fetchFn, calls } = scriptedFetch(responses);
  let now = start;
  const auth = new SpotifyAuth({ clientId: 'cid', redirectUri: REDIRECT, storage, fetchFn, now: () => now });
  return { auth, storage, calls, advance: (ms: number) => (now += ms) };
}

function form(body: string | undefined) {
  return Object.fromEntries(new URLSearchParams(body ?? ''));
}

async function loggedIn(extra: { status: number; body?: unknown }[] = []) {
  const s = setup([{ status: 200, body: { access_token: 'a1', refresh_token: 'r1', expires_in: 3600 } }, ...extra]);
  const url = new URL(await s.auth.beginLogin());
  await s.auth.completeLogin(`?code=c1&state=${url.searchParams.get('state')}`);
  return s;
}

describe('SpotifyAuth login', () => {
  it('stores a verifier and returns an authorize URL with its challenge', async () => {
    const { auth, storage } = setup();
    const url = new URL(await auth.beginLogin());
    const pending = JSON.parse(storage.getItem(PKCE_KEY) ?? '{}');
    expect(url.searchParams.get('state')).toBe(pending.state);
    expect(url.searchParams.get('code_challenge')).toBe(await challengeFor(pending.verifier));
    expect(url.searchParams.get('redirect_uri')).toBe(REDIRECT);
  });

  it('ignores URLs that are not a login callback', async () => {
    expect(await setup().auth.completeLogin('')).toBe(false);
  });

  it('exchanges the code once and keeps the tokens', async () => {
    const { auth, storage, calls } = await loggedIn();
    expect(auth.isLoggedIn()).toBe(true);
    expect(storage.getItem(PKCE_KEY)).toBeNull();
    expect(calls[0].url).toBe('https://accounts.spotify.com/api/token');
    expect(calls[0].init?.method).toBe('POST');
    expect(form(calls[0].init?.body)).toMatchObject({
      grant_type: 'authorization_code',
      code: 'c1',
      redirect_uri: REDIRECT,
      client_id: 'cid',
    });
    expect(form(calls[0].init?.body).code_verifier).toMatch(/^[A-Za-z0-9._~-]{64}$/);
    expect(await auth.accessToken()).toBe('a1');
  });

  it('rejects a callback whose state does not match', async () => {
    const { auth } = setup();
    await auth.beginLogin();
    await expect(auth.completeLogin('?code=c1&state=forged')).rejects.toThrow('Spotify login expired, please try again');
    expect(auth.isLoggedIn()).toBe(false);
  });

  it('explains a cancelled login', async () => {
    const { auth } = setup();
    const url = new URL(await auth.beginLogin());
    await expect(auth.completeLogin(`?error=access_denied&state=${url.searchParams.get('state')}`)).rejects.toThrow(
      'Spotify login was cancelled',
    );
  });
});

describe('SpotifyAuth tokens', () => {
  it('throws when not logged in', async () => {
    await expect(setup().auth.accessToken()).rejects.toBeInstanceOf(NotLoggedInError);
  });

  it('refreshes a token about to expire and keeps the old refresh token when none is returned', async () => {
    const s = await loggedIn([{ status: 200, body: { access_token: 'a2', expires_in: 3600 } }]);
    s.advance(3600_000 - 30_000);
    expect(await s.auth.accessToken()).toBe('a2');
    expect(form(s.calls[1].init?.body)).toEqual({ grant_type: 'refresh_token', refresh_token: 'r1', client_id: 'cid' });
    expect(JSON.parse(s.storage.getItem(TOKENS_KEY) ?? '{}').refreshToken).toBe('r1');
  });

  it('shares one refresh between concurrent callers', async () => {
    const s = await loggedIn([{ status: 200, body: { access_token: 'a2', refresh_token: 'r2', expires_in: 3600 } }]);
    const [x, y] = await Promise.all([s.auth.forceRefresh(), s.auth.forceRefresh()]);
    expect([x, y]).toEqual(['a2', 'a2']);
    expect(s.calls).toHaveLength(2);
  });

  it('logs out when Spotify rejects the refresh token, but not on a server error', async () => {
    const down = await loggedIn([{ status: 503 }]);
    await expect(down.auth.forceRefresh()).rejects.toThrow('503');
    expect(down.auth.isLoggedIn()).toBe(true);
    const revoked = await loggedIn([{ status: 400, body: { error: 'invalid_grant' } }]);
    await expect(revoked.auth.forceRefresh()).rejects.toThrow('400');
    expect(revoked.auth.isLoggedIn()).toBe(false);
  });
});
