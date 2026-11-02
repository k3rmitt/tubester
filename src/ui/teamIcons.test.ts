import { describe, expect, it } from 'vitest';
import { TEAMS } from '../host/lobby';
import { TEAM_ICONS } from './teamIcons';

describe('team logos', () => {
  it('has MiniDisc instead of Turntable', () => {
    expect(TEAMS.map((t) => t.name)).toEqual(['Vinyl', 'Cassette', 'Mixtape', 'Jukebox', 'Radio', 'Walkman', 'MiniDisc', 'Boombox']);
  });

  it('has a logo for every team', () => {
    for (const t of TEAMS) expect(TEAM_ICONS[t.id]).toMatch(/<(path|circle|rect)/);
  });
});
