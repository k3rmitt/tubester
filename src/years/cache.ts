import { createStore, get, set } from 'idb-keyval';

/** `undefined` = never looked up; `null` = looked up, no match. */
export interface YearCache {
  get(isrc: string): Promise<number | null | undefined>;
  set(isrc: string, year: number | null): Promise<void>;
}

export function memoryYearCache(): YearCache {
  const m = new Map<string, number | null>();
  return {
    get: async (isrc) => m.get(isrc),
    set: async (isrc, year) => {
      m.set(isrc, year);
    },
  };
}

export function idbYearCache(): YearCache {
  const store = createStore('tubester', 'years');
  return {
    get: (isrc) => get<number | null>(isrc, store),
    set: (isrc, year) => set(isrc, year, store),
  };
}
