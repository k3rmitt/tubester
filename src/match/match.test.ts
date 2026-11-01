import { describe, expect, it } from 'vitest';
import { levenshtein, matchesGuess, normalize } from './match';

describe('normalize', () => {
  it.each([
    ['Bohemian Rhapsody - Remastered 2011', 'bohemian rhapsody'],
    ['Crazy in Love (feat. Jay-Z)', 'crazy in love'],
    ['Somebody That I Used to Know [Live]', 'somebody that i used to know'],
    ['Beyoncé', 'beyonce'],
    ["Guns N' Roses", 'guns and roses'],
    ['Simon & Garfunkel', 'simon and garfunkel'],
    ['The Beatles', 'beatles'],
    ['Lose Yourself feat. Eminem', 'lose yourself'],
    ['  AC/DC  ', 'ac dc'],
  ])('%s → %s', (input, expected) => {
    expect(normalize(input)).toBe(expected);
  });
});

describe('levenshtein', () => {
  it('counts edits', () => {
    expect(levenshtein('kitten', 'sitting')).toBe(3);
    expect(levenshtein('', 'abc')).toBe(3);
    expect(levenshtein('same', 'same')).toBe(0);
  });
});

describe('matchesGuess', () => {
  const queen = { title: 'Bohemian Rhapsody - Remastered 2011', artists: ['Queen'] };
  const beyonce = { title: 'Crazy in Love (feat. Jay-Z)', artists: ['Beyoncé', 'JAY-Z'] };

  it.each([
    [{ title: 'bohemian rapsody', artist: 'queen' }, queen],
    [{ title: 'Bohemian Rhapsody', artist: 'Queen' }, queen],
    [{ title: 'crazy in love', artist: 'beyonce' }, beyonce],
    [{ title: 'crazy in love', artist: 'jay z' }, beyonce],
    [{ title: 'smells like teen sprit', artist: 'nirvana' }, { title: 'Smells Like Teen Spirit', artists: ['Nirvana'] }],
    [{ title: 'sweet child o mine', artist: 'guns and roses' }, { title: "Sweet Child O' Mine", artists: ["Guns N' Roses"] }],
  ])('accepts %j', (guess, track) => {
    expect(matchesGuess(guess, track)).toBe(true);
  });

  it.each([
    [{ title: 'crazy', artist: 'beyonce' }, beyonce],
    [{ title: 'bohemian rhapsody', artist: 'freddie mercury' }, queen],
    [{ title: 'bohemian rhapsody', artist: '' }, queen],
    [{ title: '', artist: 'queen' }, queen],
    [{ title: '   ', artist: '  ' }, queen],
  ])('rejects %j', (guess, track) => {
    expect(matchesGuess(guess, track)).toBe(false);
  });
});
