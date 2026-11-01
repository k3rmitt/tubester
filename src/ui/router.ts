import { useEffect, useState } from 'react';

export type Route = { name: 'home' } | { name: 'host' } | { name: 'join'; code: string };

export function parseRoute(hash: string, search = ''): Route {
  const join = /^#\/join\/(TUBE-[A-Z0-9]{4})$/i.exec(hash);
  if (join) return { name: 'join', code: join[1].toUpperCase() };
  if (hash === '#/host' || new URLSearchParams(search).has('state')) return { name: 'host' };
  return { name: 'home' };
}

export function useRoute(): Route {
  const read = () => parseRoute(window.location.hash, window.location.search);
  const [route, setRoute] = useState(read);
  useEffect(() => {
    const onChange = () => setRoute(parseRoute(window.location.hash, window.location.search));
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}

export function joinUrl(code: string): string {
  return `${window.location.origin}${window.location.pathname}#/join/${code}`;
}
