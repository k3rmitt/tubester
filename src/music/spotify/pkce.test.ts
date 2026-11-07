import { describe, expect, it } from 'vitest';
import { authorizeUrl, challengeFor, randomString, SPOTIFY_SCOPES } from './pkce';

describe('pkce', () => {
  it('derives the S256 challenge (RFC 7636 example)', async () => {
    expect(await challengeFor('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')).toBe(
      'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
    );
  });

  it('asks to read the playback state (to list Connect devices)', () => {
    expect(SPOTIFY_SCOPES).toContain('user-read-playback-state');
  });

  it('makes random strings from the PKCE alphabet', () => {
    expect(randomString(64)).toMatch(/^[A-Za-z0-9._~-]{64}$/);
    expect(randomString(4, (a) => a.map((_, i) => i))).toBe('ABCD');
  });

  it('builds the authorize URL', () => {
    const url = new URL(authorizeUrl({ clientId: 'cid', redirectUri: 'https://x.test/tubester/', challenge: 'ch', state: 'st' }));
    expect(url.origin + url.pathname).toBe('https://accounts.spotify.com/authorize');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      client_id: 'cid',
      response_type: 'code',
      redirect_uri: 'https://x.test/tubester/',
      code_challenge_method: 'S256',
      code_challenge: 'ch',
      scope: SPOTIFY_SCOPES.join(' '),
      state: 'st',
      // Always show Spotify's page (with "Not you?"): otherwise a phone silently reuses whatever account it knows.
      show_dialog: 'true',
    });
    expect(SPOTIFY_SCOPES).toContain('streaming');
    expect(SPOTIFY_SCOPES).toContain('user-modify-playback-state');
  });
});
