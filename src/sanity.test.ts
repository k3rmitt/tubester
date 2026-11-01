import { describe, expect, it } from 'vitest';

describe('toolchain', () => {
  it('runs tests with structuredClone available', () => {
    expect(structuredClone({ a: [1] })).toEqual({ a: [1] });
  });
});
